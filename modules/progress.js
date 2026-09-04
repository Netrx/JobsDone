function renderProgress() {
  var rows = filteredOrders("in_progress");
  var list = document.getElementById("progressList");
  var empty = document.getElementById("progressEmpty");
  var count = document.getElementById("progressCount");
  count.textContent = rows.length;
  if (rows.length === 0) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  
  rows.sort(function(a, b) {
    var aActive = getOrderTimer(a.id) && getOrderTimer(a.id).isRunning;
    var bActive = getOrderTimer(b.id) && getOrderTimer(b.id).isRunning;
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    return (b.startDate || "").localeCompare(a.startDate || "");
  });
  
  var html = "";
  for (var i = 0; i < rows.length; i++) {
    var o = rows[i];
    var timer = getOrderTimer(o.id);
    var isActive = timer && timer.isRunning;
    var seconds = getOrderTimerSeconds(o.id);
    var hours = seconds / 3600;
    var pausedClass = isActive ? '' : ' paused';
    
    html += '<div class="order-card progress' + pausedClass + '" data-id="' + o.id + '">';
    html += '<div><div class="order-title">Заказ ' + escapeHtml(o.number);
    if (isActive) {
      html += ' <span class="tag active-tag">🟢 Активен</span>';
    } else {
      html += ' <span class="tag paused-tag">⏸ На паузе</span>';
    }
    html += '</div>';
    html += '<div class="order-work">' + escapeHtml(o.work || "Без описания") + '</div>';
    html += '<div class="order-meta">';
    html += '<span>' + formatDate(o.startDate) + '</span>';
    html += '<span class="timer-display" id="timer_' + o.id + '">⏱ ' + formatHoursMinutes(hours) + '</span>';
    html += '</div></div>';
    html += '<div class="order-actions">';
    if (isActive) {
      html += '<button class="pause-btn small secondary" data-id="' + o.id + '">⏸ На паузу</button>';
    } else {
      html += '<button class="resume-btn small primary" data-id="' + o.id + '">▶ Возобновить</button>';
    }
    html += '</div></div>';
  }
  list.innerHTML = html;
  
  for (var i = 0; i < rows.length; i++) {
    var timer = getOrderTimer(rows[i].id);
    if (timer && timer.isRunning) {
      startTimerTick(rows[i].id);
    }
  }
  
  var cards = list.querySelectorAll(".order-card");
  for (var i = 0; i < cards.length; i++) {
    cards[i].onclick = function(e) {
      if (e.target.closest('button')) return;
      openOrder(this.dataset.id);
    };
  }
  
  list.querySelectorAll('.resume-btn').forEach(function(btn) {
    btn.onclick = function(e) {
      e.stopPropagation();
      var orderId = this.dataset.id;
      setActiveOrder(orderId);
    };
  });
  
  list.querySelectorAll('.pause-btn').forEach(function(btn) {
    btn.onclick = function(e) {
      e.stopPropagation();
      var orderId = this.dataset.id;
      pauseOrderTimer(orderId);
      if (typeof renderProgress === "function") renderProgress();
      toast("Заказ на паузе");
    };
  });
}

function updateOrderTimerDisplay(orderId, hours) {
  var el = document.getElementById("timer_" + orderId);
  if (el) {
    el.textContent = "⏱ " + formatHoursMinutes(hours);
  }
}

document.getElementById("progressSearch").oninput = renderProgress;