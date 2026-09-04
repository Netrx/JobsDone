function renderSettings() {
}

function download(name, text, type) {
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: type }));
  a.download = name;
  a.click();
  setTimeout(function() { URL.revokeObjectURL(a.href); }, 1000);
}

document.getElementById("exportBackupBtn").onclick = function() {
  // Создаем чистую копию для экспорта
  var exportData = {
    orders: state.orders.map(function(order) {
      var cleanOrder = {
        id: order.id,
        status: order.status,
        number: order.number,
        startDate: order.startDate,
        endDate: order.endDate || "",
        work: order.work || "",
        income: order.income || 0,
        comment: order.comment || "",
        createdAt: order.createdAt
      };
      if (order.status === "completed" && order.totalHours) {
        cleanOrder.totalHours = order.totalHours;
      }
      return cleanOrder;
    }),
    settings: state.settings,
    workDays: state.workDays,
    orderTimers: state.orderTimers || {},
    lastActiveOrder: state.lastActiveOrder || null
  };
  
  var data = JSON.stringify(exportData, null, 2);
  download("worktracker_backup_" + todayISO() + ".json", data, "application/json");
};

document.getElementById("importBackupInput").onchange = function(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    try {
      var data = JSON.parse(ev.target.result);
      
      // Проверяем базовую структуру
      if (!Array.isArray(data.orders) || !data.settings) {
        throw new Error("Неверная структура данных");
      }
      
      // Создаем новый state
      var newState = {
        orders: [],
        settings: data.settings,
        workDays: {},
        orderTimers: {},
        lastActiveOrder: null
      };
      
      // Очищаем workDays от старых полей
      if (data.workDays) {
        for (var key in data.workDays) {
          var wd = data.workDays[key];
          // Пропускаем записи без end
          if (!wd.end) continue;
          newState.workDays[key] = {
            start: wd.start,
            end: wd.end
          };
        }
      }
      
      // Восстанавливаем заказы
      for (var i = 0; i < data.orders.length; i++) {
        var order = data.orders[i];
        var cleanOrder = {
          id: order.id,
          status: order.status || "completed",
          number: order.number || "",
          startDate: order.startDate || todayISO(),
          endDate: order.endDate || "",
          work: order.work || "",
          income: Number(order.income) || 0,
          comment: order.comment || "",
          createdAt: order.createdAt || new Date().toISOString()
        };
        
        // Для завершенных заказов сохраняем часы
        if (cleanOrder.status === "completed") {
          cleanOrder.totalHours = Number(order.totalHours) || 0;
        }
        
        newState.orders.push(cleanOrder);
      }
      
      // Восстанавливаем таймеры для активных заказов
      if (data.orderTimers) {
        for (var orderId in data.orderTimers) {
          var timer = data.orderTimers[orderId];
          if (timer && typeof timer === 'object') {
            // Проверяем, что заказ существует
            var orderExists = newState.orders.some(function(o) { return o.id === orderId; });
            if (orderExists) {
              newState.orderTimers[orderId] = {
                startedAt: timer.startedAt || null,
                accumulated: Number(timer.accumulated) || 0,
                isRunning: timer.isRunning || false
              };
            }
          }
        }
      }
      
      // Для активных заказов без таймеров создаем их
      for (var i = 0; i < newState.orders.length; i++) {
        var order = newState.orders[i];
        if (order.status === "in_progress" && !newState.orderTimers[order.id]) {
          newState.orderTimers[order.id] = {
            startedAt: null,
            accumulated: 0,
            isRunning: false
          };
        }
      }
      
      // Восстанавливаем lastActiveOrder
      if (data.lastActiveOrder && data.lastActiveOrder.id) {
        var orderExists = newState.orders.some(function(o) { 
          return o.id === data.lastActiveOrder.id; 
        });
        if (orderExists) {
          newState.lastActiveOrder = {
            id: data.lastActiveOrder.id,
            updatedAt: data.lastActiveOrder.updatedAt || new Date().toISOString()
          };
        }
      }
      
      // Применяем новый state
      state.orders = newState.orders;
      state.settings = newState.settings;
      state.workDays = newState.workDays;
      state.orderTimers = newState.orderTimers;
      state.lastActiveOrder = newState.lastActiveOrder;
      
      // Удаляем старые поля
      delete state.orderPauses;
      delete state.dailyHours;
      delete state.weekendHours;
      
      // Сохраняем
      saveState();
      
      // Перерисовываем
      if (typeof renderAll === "function") {
        renderAll();
      }
      
      var activeCount = newState.orders.filter(function(o) { return o.status === "in_progress"; }).length;
      toast("Резервная копия загружена (" + newState.orders.length + " заказов, " + activeCount + " активных)");
    } catch(err) {
      console.error("Ошибка импорта:", err);
      toast("Не удалось прочитать резервную копию: " + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = "";
};

document.getElementById("resetBtn").onclick = function() {
  if (!confirm("Очистить все данные?")) return;
  state = { 
    orders: [], 
    settings: { standardStart: "10:00", standardEnd: "18:00" }, 
    workDays: {},
    orderTimers: {},
    lastActiveOrder: null
  };
  saveState();
  if (typeof renderAll === "function") {
    renderAll();
  }
  toast("Все данные очищены");
};

var themeToggle = document.getElementById("themeToggle");
var html = document.documentElement;
var metaTheme = document.querySelector('meta[name="theme-color"]');

if (localStorage.getItem("theme") === "dark") {
  html.setAttribute("data-theme", "dark");
  themeToggle.checked = true;
  if (metaTheme) metaTheme.content = "#121212";
}

themeToggle.addEventListener("change", function() {
  if (themeToggle.checked) {
    html.setAttribute("data-theme", "dark");
    if (metaTheme) metaTheme.content = "#121212";
    localStorage.setItem("theme", "dark");
  } else {
    html.setAttribute("data-theme", "light");
    if (metaTheme) metaTheme.content = "#ffffff";
    localStorage.setItem("theme", "light");
  }
});