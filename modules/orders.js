function filteredOrders(status) {
  var q = "";
  if (status === "completed") {
    var search = document.getElementById("orderSearch");
    if (search) q = search.value.trim().toLowerCase();
  } else {
    var search = document.getElementById("progressSearch");
    if (search) q = search.value.trim().toLowerCase();
  }
  var result = [];
  for (var i = 0; i < state.orders.length; i++) {
    var o = state.orders[i];
    var oStatus = isCompleted(o) ? "completed" : "in_progress";
    if (oStatus !== status) continue;
    var text = (o.number || "") + " " + (o.work || "") + " " + (o.comment || "");
    if (text.toLowerCase().indexOf(q) === -1) continue;
    result.push(o);
  }
  result.sort(function(a, b) {
    return (b.startDate || "").localeCompare(a.startDate || "");
  });
  return result;
}

function renderOrders() {
  var rows = filteredOrders("completed");
  var list = document.getElementById("ordersList");
  var empty = document.getElementById("ordersEmpty");
  if (rows.length === 0) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  var html = "";
  for (var i = 0; i < rows.length; i++) {
    var o = rows[i];
    var h = calculateOrderHours(o);
    var per = h > 0 ? (Number(o.income) || 0) / h : 0;
    var completion = o.endDate ? formatDate(o.endDate) : "Не указано";
    html += '<div class="order-card" data-id="' + o.id + '">';
    html += '<div><div class="order-title">Заказ ' + escapeHtml(o.number) + '</div>';
    html += '<div class="order-work">' + escapeHtml(o.work || "Без описания") + '</div>';
    html += '<div class="order-meta"><span>' + formatDate(o.startDate) + ' → ' + completion + '</span><span>' + formatHoursMinutes(h) + '</span><span>' + money(per) + '/ч</span></div></div>';
    html += '<div class="order-money">' + money(o.income) + '<small>' + escapeHtml(o.comment || "") + '</small></div>';
    html += '</div>';
  }
  list.innerHTML = html;
  var cards = list.querySelectorAll(".order-card");
  for (var i = 0; i < cards.length; i++) {
    cards[i].onclick = function() { openOrder(this.dataset.id); };
  }
}

document.getElementById("orderSearch").oninput = renderOrders;

function syncStatusFields() {
  var inProgress = document.getElementById("orderInProgress").checked;
  var fields = document.getElementById("completionFields");
  var hoursField = document.getElementById("hoursField");
  var income = document.getElementById("income");
  if (inProgress) {
    fields.classList.add("hidden");
    income.required = false;
    hoursField.style.display = "block";
  } else {
    fields.classList.remove("hidden");
    income.required = true;
    hoursField.style.display = "block";
  }
}

// ===== Вспомогательные функции для формата ЧЧ:ММ =====
function hoursToTimeString(hoursDecimal) {
  if (!hoursDecimal || hoursDecimal <= 0) return "";
  var h = Math.floor(hoursDecimal);
  var m = Math.round((hoursDecimal - h) * 60);
  if (m === 60) { h++; m = 0; }
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

function timeStringToHours(timeStr) {
  if (!timeStr) return NaN;
  var parts = timeStr.split(":");
  if (parts.length !== 2) return NaN;
  var h = parseInt(parts[0]);
  var m = parseInt(parts[1]);
  if (isNaN(h) || isNaN(m)) return NaN;
  return h + m / 60;
}
// =================================================

function openOrder(id) {
  id = id || null;
  document.getElementById("orderForm").reset();
  var order = null;
  if (id) {
    for (var i = 0; i < state.orders.length; i++) {
      if (state.orders[i].id === id) { order = state.orders[i]; break; }
    }
  }
  var title = document.getElementById("orderDialogTitle");
  title.textContent = order ? "Редактировать заказ" : "Новый заказ";
  var delBtn = document.getElementById("deleteOrderBtn");
  if (order) delBtn.classList.remove("hidden");
  else delBtn.classList.add("hidden");
  document.getElementById("orderId").value = order ? order.id : "";
  document.getElementById("orderInProgress").checked = order ? (order.status === "in_progress") : false;
  document.getElementById("orderNumber").value = order ? order.number : "";
  document.getElementById("startDate").value = order ? order.startDate : todayISO();
  document.getElementById("endDate").value = order ? (order.endDate || "") : "";
  document.getElementById("workDone").value = order ? order.work : "";
  document.getElementById("income").value = order ? order.income : "";
  document.getElementById("comment").value = order ? order.comment : "";
  
  // Поле для ручного ввода часов в формате ЧЧ:ММ
  var hoursInput = document.getElementById("editHours");
  if (order) {
    var currentHours = calculateOrderHours(order);
    hoursInput.value = currentHours > 0 ? hoursToTimeString(currentHours) : "";
    hoursInput.placeholder = "Например: 04:30";
  } else {
    hoursInput.value = "";
    hoursInput.placeholder = "Например: 04:30";
  }
  
  var timerInfo = document.getElementById("orderTimerInfo");
  if (order) {
    var hours = calculateOrderHours(order);
    var statusText = order.status === "completed" ? "Отработано" : "Текущее время";
    timerInfo.textContent = "⏱ " + statusText + ": " + formatHoursMinutes(hours);
    timerInfo.style.display = "block";
    
    if (order.status === "in_progress") {
      startTimerDisplay(order.id);
    } else {
      stopTimerDisplay();
    }
  } else {
    timerInfo.style.display = "none";
  }
  
  syncStatusFields();
  var dialog = document.getElementById("orderDialog");
  dialog.showModal();
}

var timerDisplayInterval = null;

function startTimerDisplay(orderId) {
  stopTimerDisplay();
  timerDisplayInterval = setInterval(function() {
    var hours = getOrderTimerHours(orderId);
    var el = document.getElementById("orderTimerInfo");
    if (el) {
      el.textContent = "⏱ Текущее время: " + formatHoursMinutes(hours);
    }
    // Также обновляем поле с часами (placeholder)
    var hoursInput = document.getElementById("editHours");
    if (hoursInput && document.getElementById("orderDialog").open) {
      var currentHours = getOrderTimerHours(orderId);
      hoursInput.placeholder = "Текущее: " + hoursToTimeString(currentHours);
    }
  }, 1000);
}

function stopTimerDisplay() {
  if (timerDisplayInterval) {
    clearInterval(timerDisplayInterval);
    timerDisplayInterval = null;
  }
}

function formOrder() {
  var id = document.getElementById("orderId").value;
  if (!id) id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
  var isInProgress = document.getElementById("orderInProgress").checked;
  var endDate = isInProgress ? null : document.getElementById("endDate").value;
  
  // Получаем вручную введённое время в формате ЧЧ:ММ
  var hoursInput = document.getElementById("editHours");
  var timeStr = hoursInput.value.trim();
  var manualHours = timeStringToHours(timeStr);
  var hasManualHours = !isNaN(manualHours) && manualHours > 0;
  
  var order = {
    id: id,
    status: isInProgress ? "in_progress" : "completed",
    number: document.getElementById("orderNumber").value.trim(),
    startDate: document.getElementById("startDate").value,
    endDate: endDate,
    work: document.getElementById("workDone").value.trim(),
    income: Number(document.getElementById("income").value) || 0,
    comment: document.getElementById("comment").value.trim(),
    createdAt: new Date().toISOString()
  };
  
  if (!isInProgress) {
    // Завершённый заказ
    if (hasManualHours) {
      // Используем ручные часы
      order.totalHours = Math.round(manualHours * 100) / 100;
    } else {
      // Если нет ручных часов, пытаемся взять из таймера
      var timerHours = getOrderTimerSeconds(id) / 3600;
      if (timerHours > 0) {
        order.totalHours = Math.round(timerHours * 100) / 100;
      } else {
        order.totalHours = 0;
      }
    }
    stopOrderTimer(id);
  } else {
    // Активный заказ
    if (hasManualHours) {
      // Устанавливаем таймер с указанным количеством часов
      var timer = getOrderTimer(id);
      if (timer) {
        // Если таймер существует, обновляем accumulated
        timer.accumulated = manualHours * 3600;
        if (timer.isRunning) {
          // Если таймер запущен, сбрасываем startedAt, чтобы не накапливалось дважды
          timer.startedAt = new Date().toISOString();
        }
        saveOrderTimer(id, timer);
      } else {
        // Создаём новый таймер с указанным временем
        var timerData = {
          startedAt: new Date().toISOString(),
          accumulated: manualHours * 3600,
          isRunning: true
        };
        saveOrderTimer(id, timerData);
        startTimerTick(id);
      }
    } else {
      // Если нет ручных часов, проверяем существующий таймер
      var timer = getOrderTimer(id);
      if (!timer) {
        startOrderTimer(id);
      }
    }
  }
  
  return order;
}

document.getElementById("closeOrderDialog").onclick = function() {
  stopTimerDisplay();
  document.getElementById("orderDialog").close();
};

document.getElementById("orderInProgress").onchange = syncStatusFields;

document.getElementById("orderForm").onsubmit = function(e) {
  e.preventDefault();
  var o = formOrder();
  
  var existing = -1;
  for (var i = 0; i < state.orders.length; i++) {
    if (state.orders[i].id === o.id) { existing = i; break; }
  }
  
  if (o.status === "completed") {
    stopOrderTimer(o.id);
  }
  
  if (existing >= 0) {
    state.orders[existing] = o;
  } else {
    state.orders.push(o);
    if (o.status === "in_progress") {
      setActiveOrder(o.id);
    }
  }
  
  if (o.status === "in_progress") {
    var timer = getOrderTimer(o.id);
    if (!timer || !timer.isRunning) {
      setActiveOrder(o.id);
    }
  }
  
  saveState();
  stopTimerDisplay();
  document.getElementById("orderDialog").close();
  toast("Заказ сохранён" + (o.status === "in_progress" ? " (активен)" : ""));
  if (typeof renderAll === "function") renderAll();
};

document.getElementById("deleteOrderBtn").onclick = function() {
  var id = document.getElementById("orderId").value;
  if (!id) return;
  if (!confirm("Удалить заказ?")) return;
  
  stopOrderTimer(id);
  var newOrders = [];
  for (var i = 0; i < state.orders.length; i++) {
    if (state.orders[i].id !== id) newOrders.push(state.orders[i]);
  }
  state.orders = newOrders;
  saveState();
  stopTimerDisplay();
  document.getElementById("orderDialog").close();
  toast("Заказ удалён");
  if (typeof renderAll === "function") renderAll();
};

document.getElementById("addOrderBtn").onclick = function() { openOrder(); };
document.getElementById("addProgressBtn").onclick = function() {
  openOrder();
  document.getElementById("orderInProgress").checked = true;
  syncStatusFields();
};