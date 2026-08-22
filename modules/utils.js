var STORAGE_KEY = "worktracker-app-v1";
var MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

var state = loadState();

function loadState() {
  try {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      var parsed = JSON.parse(saved);
      if (parsed.orders && parsed.settings) {
        if (!parsed.orderPauses) parsed.orderPauses = {};
        if (!parsed.workDays) parsed.workDays = {};
        if (!parsed.lastActiveOrder) parsed.lastActiveOrder = null;
        // Убеждаемся, что все паузы в workDays корректны
        for (var key in parsed.workDays) {
          var wd = parsed.workDays[key];
          if (!wd.pauses) wd.pauses = [];
          if (!Array.isArray(wd.pauses)) wd.pauses = [];
        }
        // Убеждаемся, что все паузы в orderPauses корректны
        for (var orderId in parsed.orderPauses) {
          if (!Array.isArray(parsed.orderPauses[orderId])) {
            parsed.orderPauses[orderId] = [];
          }
        }
        return parsed;
      }
    }
  } catch(e) {
    console.warn("Ошибка загрузки данных, создаем новые:", e);
  }
  
  // Создаем тестовые данные
  var today = new Date();
  var yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  var yIso = toISODate(yesterday);
  var testOrders = [
    {
      id: "test-1",
      number: "1001",
      startTime: "10:00",
      endTime: "18:00",
      startDate: yIso,
      endDate: yIso,
      work: "Сборка конструкции",
      income: 5000,
      comment: "",
      status: "completed",
      createdAt: new Date().toISOString()
    },
    {
      id: "test-2",
      number: "1002",
      startTime: "09:00",
      endTime: "17:00",
      startDate: yIso,
      endDate: yIso,
      work: "Обработка деталей",
      income: 3500,
      comment: "",
      status: "completed",
      createdAt: new Date().toISOString()
    }
  ];
  var testWorkDays = {};
  testWorkDays[yIso] = { 
    start: "10:00", 
    end: "18:00", 
    pausedAt: "", 
    pauses: [] 
  };
  var testData = {
    orders: testOrders,
    settings: { standardStart: "10:00", standardEnd: "18:00" },
    workDays: testWorkDays,
    orderPauses: {},
    lastActiveOrder: null
  };
  return testData;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (typeof renderAll === "function") {
    renderAll();
  }
}

function toast(message) {
  var el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(function() { el.classList.remove("show"); }, 2200);
}

function money(value) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number(value) || 0) + " ₽";
}

function formatHoursMinutes(hoursDecimal) {
  var h = Math.floor(hoursDecimal);
  var m = Math.round((hoursDecimal - h) * 60);
  if (h === 0 && m === 0) return "0 ч 0 м";
  if (h === 0) return m + " м";
  if (m === 0) return h + " ч";
  return h + " ч " + m + " м";
}

function parseTime(value) {
  if (!value) return 0;
  var parts = value.split(":");
  return Number(parts[0]) + Number(parts[1]) / 60;
}

function toISODate(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function parseDate(s) {
  return new Date(s + "T12:00:00");
}

function addDays(d, n) {
  var x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function todayISO() {
  return toISODate(new Date());
}

function nowHHMM() {
  var d = new Date();
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

function isCompleted(order) {
  return (order.status || "completed") === "completed";
}

function workIntervalsForDate(date) {
  var key = typeof date === "string" ? date : toISODate(date);
  var wd = state.workDays && state.workDays[key];
  if (wd && wd.start) {
    var start = parseTime(wd.start);
    var end = wd.end ? parseTime(wd.end) : 0;
    if (end > start) {
      var pauses = Array.isArray(wd.pauses) ? wd.pauses : [];
      var intervals = [];
      var cursor = start;
      for (var i = 0; i < pauses.length; i++) {
        var ps = parseTime(pauses[i].start);
        var pe = pauses[i].end ? parseTime(pauses[i].end) : 0;
        if (ps > cursor && ps < end) intervals.push([cursor, Math.min(ps, end)]);
        if (pe > cursor) cursor = Math.max(cursor, pe);
      }
      if (cursor < end) intervals.push([cursor, end]);
      return intervals.filter(function(x) { return x[1] > x[0]; });
    }
    return [];
  }
  return [];
}

function getDayWork(dateISO) {
  return state.workDays[dateISO] || {};
}

function getWorkedHoursForDate(dateISO) {
  var intervals = workIntervalsForDate(dateISO);
  var total = 0;
  for (var i = 0; i < intervals.length; i++) {
    total += intervals[i][1] - intervals[i][0];
  }
  var wd = state.workDays && state.workDays[dateISO];
  if (wd && wd.pauses && Array.isArray(wd.pauses)) {
    for (var p = 0; p < wd.pauses.length; p++) {
      var pause = wd.pauses[p];
      if (pause.start && pause.end) {
        var ps = parseTime(pause.start);
        var pe = parseTime(pause.end);
        if (pe > ps) {
          total -= (pe - ps);
        }
      }
    }
  }
  return Math.max(0, total);
}

function escapeHtml(value) {
  if (!value) return "";
  return String(value).replace(/[&<>"']/g, function(c) {
    if (c === "&") return "&amp;";
    if (c === "<") return "&lt;";
    if (c === ">") return "&gt;";
    if (c === '"') return "&quot;";
    if (c === "'") return "&#039;";
    return c;
  });
}

function formatDate(s) {
  if (!s) return "—";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(parseDate(s));
}

function getOrderPauses(orderId) {
  if (!state.orderPauses) state.orderPauses = {};
  return state.orderPauses[orderId] || [];
}

function saveOrderPauses(orderId, pauses) {
  if (!state.orderPauses) state.orderPauses = {};
  if (!pauses || pauses.length === 0) {
    delete state.orderPauses[orderId];
  } else {
    state.orderPauses[orderId] = pauses;
  }
  saveState();
}

function hasActivePause(orderId) {
  var pauses = getOrderPauses(orderId);
  for (var i = 0; i < pauses.length; i++) {
    if (pauses[i].start && !pauses[i].end) {
      return true;
    }
  }
  return false;
}

function getOrderPauseDate(orderId) {
  var pauses = getOrderPauses(orderId);
  for (var i = 0; i < pauses.length; i++) {
    if (pauses[i].start && !pauses[i].end) {
      var startDate = new Date(pauses[i].start);
      return startDate.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
    }
  }
  return null;
}

function getOrderPauseHoursOnDate(orderId, dateISO) {
  var pauses = getOrderPauses(orderId);
  if (pauses.length === 0) return 0;
  var pauseDate = parseDate(dateISO);
  var pauseDayStart = new Date(pauseDate);
  pauseDayStart.setHours(0, 0, 0, 0);
  var pauseDayEnd = new Date(pauseDate);
  pauseDayEnd.setHours(23, 59, 59, 999);
  var totalPauseHours = 0;
  for (var p = 0; p < pauses.length; p++) {
    if (!pauses[p].start || !pauses[p].end) continue;
    var pauseStartMs = Date.parse(pauses[p].start);
    var pauseEndMs = Date.parse(pauses[p].end);
    if (isNaN(pauseStartMs) || isNaN(pauseEndMs)) continue;
    if (pauseEndMs <= pauseStartMs) continue;
    var pauseStartDate = new Date(pauseStartMs);
    var pauseEndDate = new Date(pauseEndMs);
    if (pauseStartDate < pauseDayEnd && pauseEndDate > pauseDayStart) {
      var overlapStart = Math.max(pauseStartMs, pauseDayStart.getTime());
      var overlapEnd = Math.min(pauseEndMs, pauseDayEnd.getTime());
      if (overlapEnd > overlapStart) {
        totalPauseHours += (overlapEnd - overlapStart) / (1000 * 60 * 60);
      }
    }
  }
  return totalPauseHours;
}

// Функции для работы с последним активным заказом
function setLastActiveOrder(orderId) {
  if (!state.lastActiveOrder) state.lastActiveOrder = {};
  state.lastActiveOrder.id = orderId;
  state.lastActiveOrder.updatedAt = new Date().toISOString();
  saveState();
}

function getLastActiveOrder() {
  return state.lastActiveOrder || null;
}

function resumeLastActiveOrder() {
  var last = getLastActiveOrder();
  if (!last || !last.id) return;
  
  // Проверяем, существует ли заказ и в процессе ли он
  var order = state.orders.find(function(o) { return o.id === last.id; });
  if (!order || order.status !== "in_progress") return;
  
  // Проверяем, есть ли у заказа активная пауза
  var pauses = getOrderPauses(order.id);
  var hasActivePause = false;
  var pauseIndex = -1;
  for (var i = 0; i < pauses.length; i++) {
    if (pauses[i].start && !pauses[i].end) {
      hasActivePause = true;
      pauseIndex = i;
      break;
    }
  }
  
  if (hasActivePause) {
    // Снимаем паузу
    var now = new Date();
    var dateStr = now.toISOString().split('T')[0];
    var timeStr = now.toTimeString().slice(0,5);
    pauses[pauseIndex].end = dateStr + 'T' + timeStr + ':00.000Z';
    saveOrderPauses(order.id, pauses);
    
    // Ставим все остальные заказы на паузу
    pauseAllOtherOrders(order.id);
    
    toast("Возобновлен заказ " + order.number);
    renderProgress();
  }
}