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
    html += '<div class="order-card progress' + pausedClass + '" data-id="' + o.id + '">';
    html += '<div><div class="order-title">Заказ ' + escapeHtml(o.number);
    if (hasPause) {
      html += ' <span class="tag paused-tag">Пауза</span>';
    } else {
      html += ' <span class="tag active-tag">Активный</span>';
    }
    html += '</div>';
    html += '<div class="order-work">' + escapeHtml(o.work || "Без описания") + '</div>';
    html += '<div class="order-meta"><span>' + formatDate(o.startDate) + ' → ' + completion + '</span><span>' + formatHoursMinutes(h) + ' на сегодня</span></div></div>';
    html += '<div class="order-money">Не учтён<small>' + escapeHtml(o.comment || "") + '</small></div>';
    html += '</div>';
  }
  list.innerHTML = html;
  var cards = list.querySelectorAll(".order-card");
  for (var i = 0; i < cards.length; i++) {
    cards[i].onclick = function() { openOrder(this.dataset.id); };
  }
}

document.getElementById("progressSearch").oninput = renderProgress;