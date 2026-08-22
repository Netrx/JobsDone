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
    var aPaused = hasActivePause(a.id);
    var bPaused = hasActivePause(b.id);
    if (!aPaused && bPaused) return -1;
    if (aPaused && !bPaused) return 1;
    return (b.startDate || "").localeCompare(a.startDate || "");
  });
  var html = "";
  for (var i = 0; i < rows.length; i++) {
    var o = rows[i];
    var h = orderHours(o);
    var completion = o.endDate ? formatDate(o.endDate) + (o.endTime ? " в " + o.endTime : "") : "Не указано";
    var hasPause = hasActivePause(o.id);
    var pausedClass = hasPause ? ' paused' : '';
    var isActive = !hasPause;
    html += '<div class="order-card progress' + pausedClass + '" data-id="' + o.id + '">';
    html += '<div><div class="order-title">Заказ ' + escapeHtml(o.number);
    if (hasPause) {
      html += ' <span class="tag paused-tag">Пауза</span>';
    } else {
      html += ' <span class="tag active-tag">Активный</span>';
    }
    html += '</div>';
    html += '<div class="order-work">' + escapeHtml(o.work || "Без описания") + '</div>';
    html += '<div class="order-meta"><span>' + formatDate(o.startDate) + ' → ' + completion + '</span><span>' + formatHoursMinutes(h) + ' на сегодня</span></div>';
    html += '</div>';
    html += '<div class="order-actions">';
    if (hasPause) {
      html += '<button class="resume-btn small primary" data-id="' + o.id + '">Возобновить</button>';
    } else {
      html += '<button class="pause-btn small secondary" data-id="' + o.id + '">На паузу</button>';
    }
    html += '</div>';
    html += '</div>';
  }
  list.innerHTML = html;
  var cards = list.querySelectorAll(".order-card");
  for (var i = 0; i < cards.length; i++) {
    cards[i].onclick = function(e) {
      if (e.target.closest('button')) return;
      openOrder(this.dataset.id);
    };
  }
  // Обработчики для кнопок
  list.querySelectorAll('.resume-btn').forEach(function(btn) {
    btn.onclick = function(e) {
      e.stopPropagation();
      var orderId = this.dataset.id;
      resumeOrder(orderId);
    };
  });
  list.querySelectorAll('.pause-btn').forEach(function(btn) {
    btn.onclick = function(e) {
      e.stopPropagation();
      var orderId = this.dataset.id;
      var pauses = getOrderPauses(orderId);
      var now = new Date();
      var dateStr = now.toISOString().split('T')[0];
      var timeStr = now.toTimeString().slice(0,5);
      pauses.push({ start: dateStr + 'T' + timeStr + ':00.000Z', end: null });
      saveOrderPauses(orderId, pauses);
      // Ставим все остальные на паузу
      pauseAllOtherOrders(orderId);
      renderProgress();
      toast("Заказ на паузе");
    };
  });
}

document.getElementById("progressSearch").oninput = renderProgress;