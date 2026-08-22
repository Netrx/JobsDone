function formatDurationSmart(startMs, endMs) {
  if (!startMs || !endMs || endMs <= startMs) return "";
  var diffSeconds = Math.floor((endMs - startMs) / 1000);
  if (diffSeconds < 60) return "менее минуты";
  var diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return diffMinutes + " мин";
  var diffHours = Math.floor(diffMinutes / 60);
  var remainMinutes = diffMinutes % 60;
  if (diffHours < 24) return diffHours + " ч" + (remainMinutes > 0 ? " " + remainMinutes + " мин" : "");
  var diffDays = Math.floor(diffHours / 24);
  var remainHours = diffHours % 24;
  if (diffDays < 30) {
    var parts = [];
    if (diffDays > 0) parts.push(diffDays + " д");
    if (remainHours > 0) parts.push(remainHours + " ч");
    if (remainMinutes > 0 && remainHours === 0) parts.push(remainMinutes + " мин");
    return parts.join(" ");
  }
  var diffMonths = Math.floor(diffDays / 30);
  var remainDays = diffDays % 30;
  if (diffMonths < 12) {
    var parts = [];
    if (diffMonths > 0) parts.push(diffMonths + " мес");
    if (remainDays > 0) parts.push(remainDays + " д");
    if (remainHours > 0 && remainDays === 0) parts.push(remainHours + " ч");
    return parts.join(" ");
  }
  var diffYears = Math.floor(diffMonths / 12);
  var remainMonths = diffMonths % 12;
  var parts = [];
  if (diffYears > 0) parts.push(diffYears + " г" + (diffYears > 1 ? "" : ""));
  if (remainMonths > 0) parts.push(remainMonths + " мес");
  return parts.join(" ");
}

function validateDateString(dateStr) {
  if (!dateStr) return false;
  var parts = dateStr.split('-');
  if (parts.length !== 3) return false;
  var year = parts[0];
  var month = parts[1];
  var day = parts[2];
  if (year.length !== 4) return false;
  if (!/^\d{4}$/.test(year)) return false;
  if (!/^\d{2}$/.test(month)) return false;
  if (!/^\d{2}$/.test(day)) return false;
  var y = parseInt(year);
  var m = parseInt(month);
  var d = parseInt(day);
  if (y < 1900 || y > 2200) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  var dateObj = new Date(y, m - 1, d);
  if (dateObj.getFullYear() !== y || dateObj.getMonth() !== m - 1 || dateObj.getDate() !== d) return false;
  return true;
}

function normalizeDateInput(input) {
  if (!input) return;
  var val = input.value;
  if (!val) return true;
  if (!validateDateString(val)) {
    input.style.borderColor = 'var(--danger)';
    toast('Введите корректную дату (ГГГГ-ММ-ДД)');
    setTimeout(function() {
      input.style.borderColor = '';
    }, 2000);
    return false;
  }
  input.style.borderColor = '';
  return true;
}

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
    var h = orderHours(o);
    var per = h > 0 ? (Number(o.income) || 0) / h : 0;
    var completion = o.endDate ? formatDate(o.endDate) + (o.endTime ? " в " + o.endTime : "") : "Не указано";
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
  var income = document.getElementById("income");
  if (inProgress) {
    fields.classList.add("hidden");
    income.required = false;
  } else {
    fields.classList.remove("hidden");
    income.required = true;
  }
}

function getActiveOrderId() {
  var activeOrders = state.orders.filter(function(o) {
    if (o.status !== "in_progress") return false;
    return !hasActivePause(o.id);
  });
  if (activeOrders.length === 0) return null;
  return activeOrders[0].id;
}

function pauseAllOtherOrders(orderId) {
  var allOrders = state.orders.filter(function(o) {
    return o.id !== orderId && o.status === "in_progress";
  });
  var now = new Date();
  var dateStr = now.toISOString().split('T')[0];
  var timeStr = now.toTimeString().slice(0,5);
  for (var i = 0; i < allOrders.length; i++) {
    var o = allOrders[i];
    var pauses = getOrderPauses(o.id);
    var hasActive = false;
    for (var p = 0; p < pauses.length; p++) {
      if (pauses[p].start && !pauses[p].end) {
        hasActive = true;
        break;
      }
    }
    if (!hasActive) {
      pauses.push({ start: dateStr + 'T' + timeStr + ':00.000Z', end: null });
      saveOrderPauses(o.id, pauses);
    }
  }
}

function resumeOrder(orderId) {
  // Ставим все остальные заказы на паузу
  pauseAllOtherOrders(orderId);
  // Снимаем паузу с выбранного заказа
  var pauses = getOrderPauses(orderId);
  var activePauseIndex = -1;
  for (var i = 0; i < pauses.length; i++) {
    if (pauses[i].start && !pauses[i].end) {
      activePauseIndex = i;
      break;
    }
  }
  if (activePauseIndex !== -1) {
    var now = new Date();
    var dateStr = now.toISOString().split('T')[0];
    var timeStr = now.toTimeString().slice(0,5);
    pauses[activePauseIndex].end = dateStr + 'T' + timeStr + ':00.000Z';
    saveOrderPauses(orderId, pauses);
  }
  
  // Запоминаем как последний активный заказ
  setLastActiveOrder(orderId);
  
  renderProgress();
  toast("Заказ возобновлен, остальные на паузе");
}

function parseTimeFromInput(value) {
  if (!value) return null;
  var time = value.replace(':', '');
  if (time.length !== 4) {
    if (time.length === 2) return time + ':00';
    if (time.length === 3) return time.slice(0,2) + ':' + time.slice(2) + '0';
    return null;
  }
  return time.slice(0, 2) + ':' + time.slice(2);
}

function renderOrderPauses(order) {
  var container = document.getElementById("orderPausesList");
  if (!order) {
    container.innerHTML = '';
    document.getElementById("orderPauseCount").textContent = '0';
    return;
  }
  var pauses = getOrderPauses(order.id);
  document.getElementById("orderPauseCount").textContent = pauses.length;
  if (pauses.length === 0) {
    container.innerHTML = '<div class="muted" style="padding: 8px 0; color: var(--text-secondary); font-size: 13px;">Нет пауз</div>';
    return;
  }
  var html = "";
  for (var i = 0; i < pauses.length; i++) {
    var pause = pauses[i];
    var startParts = pause.start.split('T');
    var startDateStr = startParts[0] || "";
    var startTimeStr = startParts[1] ? startParts[1].slice(0,5) : "";
    var endDateStr = "";
    var endTimeStr = "";
    var duration = "";
    if (pause.end) {
      var endParts = pause.end.split('T');
      endDateStr = endParts[0] || "";
      endTimeStr = endParts[1] ? endParts[1].slice(0,5) : "";
      var startMs = Date.parse(pause.start);
      var endMs = Date.parse(pause.end);
      if (!isNaN(startMs) && !isNaN(endMs) && endMs > startMs) {
        duration = formatDurationSmart(startMs, endMs);
      }
    }
    html += '<div class="pause-item" data-index="' + i + '">';
    html += '<div class="pause-row">';
    html += '<div class="pause-col">';
    html += '<label>Начало</label>';
    html += '<div class="pause-inputs">';
    html += '<input type="date" class="pause-start-date" value="' + startDateStr + '" data-order-id="' + order.id + '" data-pause-index="' + i + '" maxlength="10">';
    html += '<input type="time" class="pause-start-time" value="' + startTimeStr + '" data-order-id="' + order.id + '" data-pause-index="' + i + '">';
    html += '</div>';
    html += '</div>';
    html += '<div class="pause-col">';
    html += '<label>Окончание</label>';
    html += '<div class="pause-inputs">';
    html += '<input type="date" class="pause-end-date" value="' + endDateStr + '" data-order-id="' + order.id + '" data-pause-index="' + i + '" maxlength="10">';
    html += '<input type="time" class="pause-end-time" value="' + endTimeStr + '" data-order-id="' + order.id + '" data-pause-index="' + i + '">';
    html += '</div>';
    html += '</div>';
    html += '<div class="pause-actions-col">';
    if (duration) html += '<span class="pause-duration">' + duration + '</span>';
    if (!pause.end) {
      html += '<button type="button" class="small pause-resume-btn" data-order-id="' + order.id + '" data-pause-index="' + i + '">Возобновить</button>';
    } else {
      html += '<button type="button" class="small danger pause-delete" data-order-id="' + order.id + '" data-pause-index="' + i + '">✕</button>';
    }
    html += '</div>';
    html += '</div>';
    html += '</div>';
  }
  container.innerHTML = html;
  
  container.querySelectorAll('.pause-start-date').forEach(function(input) {
    input.onblur = function() {
      if (!normalizeDateInput(this)) return;
      var orderId = this.dataset.orderId;
      var index = parseInt(this.dataset.pauseIndex);
      var value = this.value;
      if (!value) return;
      var pauses = getOrderPauses(orderId);
      if (!pauses[index]) return;
      var time = pauses[index].start.split('T')[1] || '00:00:00.000Z';
      pauses[index].start = value + 'T' + time;
      saveOrderPauses(orderId, pauses);
      var order = state.orders.find(function(o) { return o.id === orderId; });
      if (order) renderOrderPauses(order);
      toast("Дата начала обновлена");
    };
    input.oninput = function() {
      var val = this.value;
      if (val.length > 10) this.value = val.slice(0, 10);
      var parts = val.split('-');
      if (parts.length === 3 && parts[0].length > 4) {
        this.value = parts[0].slice(0, 4) + '-' + parts[1] + '-' + parts[2];
      }
    };
  });
  
  container.querySelectorAll('.pause-start-time').forEach(function(input) {
    input.onblur = function() {
      var orderId = this.dataset.orderId;
      var index = parseInt(this.dataset.pauseIndex);
      var value = this.value;
      if (!value) { toast("Введите время"); return; }
      var pauses = getOrderPauses(orderId);
      if (!pauses[index]) return;
      var dateStr = pauses[index].start.split('T')[0];
      pauses[index].start = dateStr + 'T' + value + ':00.000Z';
      saveOrderPauses(orderId, pauses);
      var order = state.orders.find(function(o) { return o.id === orderId; });
      if (order) renderOrderPauses(order);
      toast("Время начала обновлено");
    };
  });
  
  container.querySelectorAll('.pause-end-date').forEach(function(input) {
    input.onblur = function() {
      if (!normalizeDateInput(this)) return;
      var orderId = this.dataset.orderId;
      var index = parseInt(this.dataset.pauseIndex);
      var value = this.value;
      var pauses = getOrderPauses(orderId);
      if (!pauses[index]) return;
      if (!value) {
        if (pauses[index].end) {
          pauses[index].end = null;
          saveOrderPauses(orderId, pauses);
          var order = state.orders.find(function(o) { return o.id === orderId; });
          if (order) renderOrderPauses(order);
          toast("Пауза стала активной");
        }
        return;
      }
      if (!pauses[index].end) {
        toast("Сначала завершите паузу через кнопку 'Возобновить'");
        return;
      }
      var time = pauses[index].end.split('T')[1] || '00:00:00.000Z';
      pauses[index].end = value + 'T' + time;
      saveOrderPauses(orderId, pauses);
      var order = state.orders.find(function(o) { return o.id === orderId; });
      if (order) renderOrderPauses(order);
      toast("Дата окончания обновлена");
    };
    input.oninput = function() {
      var val = this.value;
      if (val.length > 10) this.value = val.slice(0, 10);
      var parts = val.split('-');
      if (parts.length === 3 && parts[0].length > 4) {
        this.value = parts[0].slice(0, 4) + '-' + parts[1] + '-' + parts[2];
      }
    };
  });
  
  container.querySelectorAll('.pause-end-time').forEach(function(input) {
    input.onblur = function() {
      var orderId = this.dataset.orderId;
      var index = parseInt(this.dataset.pauseIndex);
      var value = this.value;
      var pauses = getOrderPauses(orderId);
      if (!pauses[index]) return;
      if (!value) {
        if (pauses[index].end) {
          pauses[index].end = null;
          saveOrderPauses(orderId, pauses);
          var order = state.orders.find(function(o) { return o.id === orderId; });
          if (order) renderOrderPauses(order);
          toast("Пауза стала активной");
        }
        return;
      }
      if (!pauses[index].end) {
        toast("Сначала завершите паузу через кнопку 'Возобновить'");
        return;
      }
      var dateStr = pauses[index].end.split('T')[0];
      pauses[index].end = dateStr + 'T' + value + ':00.000Z';
      saveOrderPauses(orderId, pauses);
      var order = state.orders.find(function(o) { return o.id === orderId; });
      if (order) renderOrderPauses(order);
      toast("Время окончания обновлено");
    };
  });
  
  container.querySelectorAll('.pause-resume-btn').forEach(function(btn) {
    btn.onclick = function() {
      var orderId = this.dataset.orderId;
      var index = parseInt(this.dataset.pauseIndex);
      var pauses = getOrderPauses(orderId);
      var now = new Date();
      var dateStr = now.toISOString().split('T')[0];
      var timeStr = now.toTimeString().slice(0,5);
      pauses[index].end = dateStr + 'T' + timeStr + ':00.000Z';
      saveOrderPauses(orderId, pauses);
      // Ставим все остальные заказы на паузу
      pauseAllOtherOrders(orderId);
      // Запоминаем как последний активный заказ
      setLastActiveOrder(orderId);
      var order = state.orders.find(function(o) { return o.id === orderId; });
      if (order) renderOrderPauses(order);
      renderProgress();
      toast("Заказ возобновлен, остальные на паузе");
    };
  });
  
  container.querySelectorAll('.pause-delete').forEach(function(btn) {
    btn.onclick = function() {
      var orderId = this.dataset.orderId;
      var index = parseInt(this.dataset.pauseIndex);
      var pauses = getOrderPauses(orderId);
      pauses.splice(index, 1);
      saveOrderPauses(orderId, pauses);
      var order = state.orders.find(function(o) { return o.id === orderId; });
      if (order) renderOrderPauses(order);
      renderProgress();
      toast("Пауза удалена");
    };
  });
}

function orderHoursOnDate(order, iso) {
  var workIntervals = workIntervalsForDate(iso);
  if (workIntervals.length === 0) return 0;
  var isFirst = iso === order.startDate;
  var isLast = iso === order.endDate || (order.status === "in_progress" && iso === todayISO());
  var orderStart = isFirst ? parseTime(order.startTime) : 0;
  var now = new Date();
  var currentHour = now.getHours() + now.getMinutes() / 60;
  var orderEnd = (order.status === "in_progress" && iso === todayISO()) ? currentHour : (isLast ? parseTime(order.endTime) : 24);
  if (order.status === "in_progress" && iso > todayISO()) return 0;
  if (orderEnd <= orderStart) return 0;
  var total = 0;
  for (var i = 0; i < workIntervals.length; i++) {
    var start = workIntervals[i][0];
    var end = workIntervals[i][1];
    var overlapStart = Math.max(start, orderStart);
    var overlapEnd = Math.min(end, orderEnd);
    if (overlapEnd > overlapStart) {
      var intervalHours = overlapEnd - overlapStart;
      var pauseHours = getOrderPauseHoursOnDate(order.id, iso);
      intervalHours -= pauseHours;
      total += Math.max(0, intervalHours);
    }
  }
  return total;
}

function orderHours(order) {
  if (!order.startDate) return 0;
  var endIso = order.endDate || todayISO();
  var start = parseDate(order.startDate);
  var end = parseDate(endIso);
  if (end < start) return 0;
  var total = 0;
  for (var d = new Date(start); d <= end; d = addDays(d, 1)) {
    var iso = toISODate(d);
    if (order.status === "in_progress" && iso > todayISO()) continue;
    var hours = orderHoursOnDate(order, iso);
    total += hours;
  }
  return total;
}

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
  document.getElementById("startTime").value = order ? order.startTime : state.settings.standardStart;
  document.getElementById("endTime").value = order ? (order.endTime || "") : state.settings.standardEnd;
  document.getElementById("workDone").value = order ? order.work : "";
  document.getElementById("income").value = order ? order.income : "";
  document.getElementById("comment").value = order ? order.comment : "";
  syncStatusFields();
  renderOrderPauses(order);
  var dialog = document.getElementById("orderDialog");
  dialog.showModal();
}

function formOrder() {
  var id = document.getElementById("orderId").value;
  if (!id) id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
  return {
    id: id,
    status: document.getElementById("orderInProgress").checked ? "in_progress" : "completed",
    number: document.getElementById("orderNumber").value.trim(),
    startDate: document.getElementById("startDate").value,
    startTime: document.getElementById("startTime").value,
    endDate: document.getElementById("endDate").value,
    endTime: document.getElementById("endTime").value,
    work: document.getElementById("workDone").value.trim(),
    income: Number(document.getElementById("income").value) || 0,
    comment: document.getElementById("comment").value.trim(),
    createdAt: new Date().toISOString()
  };
}

document.getElementById("closeOrderDialog").onclick = function() {
  document.getElementById("orderDialog").close();
};

document.getElementById("orderInProgress").onchange = syncStatusFields;

document.getElementById("addOrderPauseBtn").onclick = function() {
  var orderId = document.getElementById("orderId").value;
  if (!orderId) {
    toast("Сначала сохраните заказ");
    return;
  }
  var order = state.orders.find(function(o) { return o.id === orderId; });
  if (!order) {
    toast("Заказ не найден");
    return;
  }
  var pauses = getOrderPauses(orderId);
  var hasActive = false;
  for (var i = 0; i < pauses.length; i++) {
    if (pauses[i].start && !pauses[i].end) {
      hasActive = true;
      break;
    }
  }
  if (hasActive) {
    toast("У заказа уже есть активная пауза. Сначала возобновите его.");
    return;
  }
  var now = new Date();
  var dateStr = now.toISOString().split('T')[0];
  var timeStr = now.toTimeString().slice(0,5);
  pauses.push({ start: dateStr + 'T' + timeStr + ':00.000Z', end: null });
  saveOrderPauses(orderId, pauses);
  if (order.status === "in_progress") {
    pauseAllOtherOrders(orderId);
  }
  renderOrderPauses(order);
  renderProgress();
  toast("Пауза начата" + (order.status === "in_progress" ? ", остальные заказы на паузе" : ""));
};

document.getElementById("orderForm").onsubmit = function(e) {
  e.preventDefault();
  var o = formOrder();
  if (o.endDate && parseDate(o.endDate) < parseDate(o.startDate)) {
    toast("Дата выполнения раньше даты начала");
    return;
  }
  var existing = -1;
  for (var i = 0; i < state.orders.length; i++) {
    if (state.orders[i].id === o.id) { existing = i; break; }
  }
  if (existing >= 0) {
    state.orders[existing] = o;
  } else {
    state.orders.push(o);
  }
  
  // Если заказ в процессе - ставим его на паузу по умолчанию
  if (o.status === "in_progress") {
    // Ставим все остальные заказы на паузу
    pauseAllOtherOrders(o.id);
    // Проверяем, есть ли у этого заказа активная пауза
    var pauses = getOrderPauses(o.id);
    var hasActivePause = false;
    for (var p = 0; p < pauses.length; p++) {
      if (pauses[p].start && !pauses[p].end) {
        hasActivePause = true;
        break;
      }
    }
    // Если нет активной паузы - создаем её (заказ по умолчанию на паузе)
    if (!hasActivePause) {
      var now = new Date();
      var dateStr = now.toISOString().split('T')[0];
      var timeStr = now.toTimeString().slice(0,5);
      pauses.push({ start: dateStr + 'T' + timeStr + ':00.000Z', end: null });
      saveOrderPauses(o.id, pauses);
    }
  }
  
  saveState();
  document.getElementById("orderDialog").close();
  toast("Заказ сохранён" + (o.status === "in_progress" ? " (по умолчанию на паузе)" : ""));
};

document.getElementById("deleteOrderBtn").onclick = function() {
  var id = document.getElementById("orderId").value;
  if (!id) return;
  if (!confirm("Удалить заказ?")) return;
  var newOrders = [];
  for (var i = 0; i < state.orders.length; i++) {
    if (state.orders[i].id !== id) newOrders.push(state.orders[i]);
  }
  state.orders = newOrders;
  saveState();
  document.getElementById("orderDialog").close();
  toast("Заказ удалён");
};

document.getElementById("addOrderBtn").onclick = function() { openOrder(); };
document.getElementById("addProgressBtn").onclick = function() {
  openOrder();
  document.getElementById("orderInProgress").checked = true;
  syncStatusFields();
};