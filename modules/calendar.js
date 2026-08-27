function renderCalendar() {
  var container = document.getElementById("calendarApp");
  var today = todayISO();
  if (!window.calendarState) {
    var now = new Date();
    window.calendarState = {
      year: now.getFullYear(),
      month: now.getMonth()
    };
  }
  var year = window.calendarState.year;
  var month = window.calendarState.month;
  var html = '';
  var wdToday = getDayWork(today);
  var dObjToday = parseDate(today);
  var dateStrToday = dObjToday.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  var workedToday = getWorkedHoursForDate(today);
  var statusText = "Не начата";
  var paused = wdToday.pausedAt && !wdToday.end;
  if (wdToday.start && wdToday.end) statusText = "Завершена";
  else if (wdToday.start && paused) statusText = "На паузе";
  else if (wdToday.start) statusText = "Работает";
  html += '<div class="today-panel">';
  html += '<div class="today-header">';
  html += '<span class="today-label">Сегодня</span>';
  html += '<span class="today-date">' + dateStrToday + '</span>';
  html += '</div>';
  html += '<div class="today-status">';
  html += '<span>' + statusText + '</span>';
  html += '<span>' + formatHoursMinutes(workedToday) + '</span>';
  html += '</div>';
  html += '<div class="today-actions">';
  html += '<button class="btn-start" id="todayStartBtn" ' + (wdToday.start && !wdToday.end ? 'disabled' : '') + '>Начать</button>';
  html += '<button class="btn-pause" id="todayPauseBtn" ' + (!wdToday.start || wdToday.end || wdToday.pausedAt ? 'disabled' : '') + '>Пауза</button>';
  html += '<button class="btn-resume" id="todayResumeBtn" ' + (!wdToday.start || wdToday.end || !wdToday.pausedAt ? 'disabled' : '') + '>Продолжить</button>';
  html += '<button class="btn-end" id="todayEndBtn" ' + (!wdToday.start || wdToday.end ? 'disabled' : '') + '>Закончить</button>';
  html += '</div>';
  html += '</div>';
  html += '<div class="month-nav">';
  html += '<button class="month-arrow" id="prevMonth">‹</button>';
  html += '<button class="month-title-btn" id="monthPickerBtn">' + MONTHS[month] + ' ' + year + '</button>';
  html += '<button class="month-arrow" id="nextMonth">›</button>';
  html += '</div>';
  html += '<div class="calendar-grid">';
  var firstDay = new Date(year, month, 1);
  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var startOffset = (firstDay.getDay() + 6) % 7;
  var dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  for (var i = 0; i < dayNames.length; i++) {
    var isWeekend = (i === 5 || i === 6);
    html += '<div class="day-head' + (isWeekend ? ' weekend' : '') + '">' + dayNames[i] + '</div>';
  }
  for (var i = 0; i < startOffset; i++) {
    html += '<div class="day-cell empty"></div>';
  }
  var todayDate = new Date(todayISO() + "T00:00:00");
  for (var d = 1; d <= daysInMonth; d++) {
    var dateObj = new Date(year, month, d);
    var iso = toISODate(dateObj);
    var wd = getDayWork(iso);
    var worked = getWorkedHoursForDate(iso);
    var isToday = iso === today;
    var isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
    var hasWork = wd.start && wd.end;
    var isFuture = dateObj > todayDate;
    var cls = "day-cell";
    if (isToday) cls += " today";
    if (isWeekend) cls += " weekend";
    if (hasWork) cls += " has-work";
    if (isFuture) cls += " future";
    var hoursText = "";
    if (hasWork && worked > 0) {
      hoursText = formatHoursMinutes(worked);
    }
    html += '<div class="' + cls + '" data-date="' + iso + '">';
    html += '<span class="day-number">' + d + '</span>';
    if (hoursText) html += '<span class="day-hours">' + hoursText + '</span>';
    html += '</div>';
  }
  html += '</div>';

  // --- БЛОК: Отработано в этом месяце ---
  var totalMonthHours = 0;
  for (var d = 1; d <= daysInMonth; d++) {
    var dateObj = new Date(year, month, d);
    var iso = toISODate(dateObj);
    // Если день в будущем, не считаем (или считаем только если есть данные)
    // Лучше считать только те дни, которые уже прошли или есть запись
    var wd = getDayWork(iso);
    if (wd.start && wd.end) {
      totalMonthHours += getWorkedHoursForDate(iso);
    }
  }
  html += '<div class="month-total">';
  html += '<span class="month-total-label">Отработано в этом месяце</span>';
  html += '<span class="month-total-value">' + formatHoursMinutes(totalMonthHours) + '</span>';
  html += '</div>';
  // --- Конец блока ---

  html += '<div class="day-detail-popup" id="dayDetailPopup">';
  html += '<div class="popup-card">';
  html += '<div class="popup-head">';
  html += '<h3 id="popupDateTitle">—</h3>';
  html += '<button class="popup-close" id="popupCloseBtn">✕</button>';
  html += '</div>';
  html += '<div class="popup-field"><label>Начало смены</label><input type="text" id="popupStartTime" placeholder="10:00" maxlength="5"></div>';
  html += '<div class="popup-field"><label>Окончание смены</label><input type="text" id="popupEndTime" placeholder="18:00" maxlength="5"></div>';
  html += '<div class="popup-field"><label>Статус смены</label><div id="popupShiftStatus" style="font-size:14px;padding:8px 0;"></div></div>';
  html += '<div class="popup-pauses">';
  html += '<div class="pause-header"><span class="pause-label">Паузы</span><button class="small secondary" id="popupAddPauseBtn">+ Добавить</button></div>';
  html += '<div id="popupPausesContainer"></div>';
  html += '</div>';
  html += '<div class="popup-actions">';
  html += '<button class="secondary" id="popupSaveBtn">Сохранить</button>';
  html += '<button class="danger" id="popupClearBtn">Очистить</button>';
  html += '</div>';
  html += '</div></div>';
  container.innerHTML = html;
  document.getElementById("prevMonth").onclick = function() {
    window.calendarState.month--;
    if (window.calendarState.month < 0) {
      window.calendarState.month = 11;
      window.calendarState.year--;
    }
    renderCalendar();
  };
  document.getElementById("nextMonth").onclick = function() {
    window.calendarState.month++;
    if (window.calendarState.month > 11) {
      window.calendarState.month = 0;
      window.calendarState.year++;
    }
    renderCalendar();
  };
  document.getElementById("monthPickerBtn").onclick = function() {
    var picker = document.createElement("div");
    picker.className = "month-picker-overlay";
    picker.innerHTML = 
      '<div class="month-picker-card">' +
        '<div class="month-picker-head">' +
          '<h3>Выберите месяц и год</h3>' +
          '<button class="popup-close" id="pickerCloseBtn">✕</button>' +
        '</div>' +
        '<div class="month-picker-selects">' +
          '<select id="pickerMonthSelect">' +
            '<option value="0">Январь</option>' +
            '<option value="1">Февраль</option>' +
            '<option value="2">Март</option>' +
            '<option value="3">Апрель</option>' +
            '<option value="4">Май</option>' +
            '<option value="5">Июнь</option>' +
            '<option value="6">Июль</option>' +
            '<option value="7">Август</option>' +
            '<option value="8">Сентябрь</option>' +
            '<option value="9">Октябрь</option>' +
            '<option value="10">Ноябрь</option>' +
            '<option value="11">Декабрь</option>' +
          '</select>' +
          '<select id="pickerYearSelect"></select>' +
        '</div>' +
        '<button class="primary wide" id="pickerConfirmBtn">Выбрать</button>' +
      '</div>';
    document.body.appendChild(picker);
    picker.classList.add("open");
    var monthSelect = document.getElementById("pickerMonthSelect");
    var yearSelect = document.getElementById("pickerYearSelect");
    monthSelect.value = window.calendarState.month;
    var currentYear = new Date().getFullYear();
    for (var y = currentYear - 10; y <= currentYear + 10; y++) {
      var opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      yearSelect.appendChild(opt);
    }
    yearSelect.value = window.calendarState.year;
    document.getElementById("pickerCloseBtn").onclick = function() {
      picker.remove();
    };
    document.getElementById("pickerConfirmBtn").onclick = function() {
      window.calendarState.month = parseInt(monthSelect.value);
      window.calendarState.year = parseInt(yearSelect.value);
      picker.remove();
      renderCalendar();
    };
    picker.onclick = function(e) {
      if (e.target === picker) picker.remove();
    };
  };
  document.getElementById("todayStartBtn").onclick = function() {
    var date = todayISO();
    var wd = getDayWork(date);
    if (wd.start && !wd.end) {
      toast("Смена уже активна");
      return;
    }
    var t = nowHHMM();
    if (wd.start && wd.end) {
      state.workDays[date] = {
        start: wd.start,
        end: "",
        pausedAt: "",
        pauses: wd.pauses || []
      };
      toast("Смена продолжена с " + wd.start);
    } else if (!wd.start) {
      state.workDays[date] = {
        start: t,
        end: "",
        pausedAt: "",
        pauses: []
      };
      toast("Смена начата в " + t);
    }
    
    // При начале смены - возобновляем последний активный заказ
    resumeLastActiveOrder();
    
    saveState();
    renderCalendar();
    renderProgress();
  };
  document.getElementById("todayPauseBtn").onclick = function() {
    var date = todayISO();
    var wd = getDayWork(date);
    if (!wd.start || wd.end || wd.pausedAt) {
      toast("Нельзя поставить на паузу");
      return;
    }
    var t = nowHHMM();
    wd.pausedAt = t;
    state.workDays[date] = wd;
    saveState();
    toast("Смена на паузе с " + t);
    renderCalendar();
  };
  document.getElementById("todayResumeBtn").onclick = function() {
    var date = todayISO();
    var wd = getDayWork(date);
    if (!wd.start || wd.end || !wd.pausedAt) {
      toast("Нельзя продолжить");
      return;
    }
    if (!wd.pauses) wd.pauses = [];
    var t = nowHHMM();
    wd.pauses.push({ start: wd.pausedAt, end: t });
    wd.pausedAt = "";
    state.workDays[date] = wd;
    saveState();
    toast("Смена продолжена в " + t);
    renderCalendar();
  };
  document.getElementById("todayEndBtn").onclick = function() {
    var date = todayISO();
    var wd = getDayWork(date);
    if (!wd.start || wd.end) {
      toast("Смена не начата или уже завершена");
      return;
    }
    var t = nowHHMM();
    if (wd.pausedAt) {
      var ps = parseTime(wd.pausedAt);
      var pe = parseTime(t);
      if (pe > ps) {
        wd.pauses = wd.pauses || [];
        wd.pauses.push({ start: wd.pausedAt, end: t });
      }
      wd.pausedAt = "";
    }
    if (parseTime(t) <= parseTime(wd.start)) {
      toast("Конец должен быть позже начала");
      return;
    }
    wd.end = t;
    state.workDays[date] = wd;
    
    // При завершении смены - ставим все активные заказы на паузу
    var activeOrders = state.orders.filter(function(o) {
      return o.status === "in_progress" && !hasActivePause(o.id);
    });
    var now = new Date();
    var dateStr = now.toISOString().split('T')[0];
    var timeStr = now.toTimeString().slice(0,5);
    for (var i = 0; i < activeOrders.length; i++) {
      var order = activeOrders[i];
      var pauses = getOrderPauses(order.id);
      var pauseStart = dateStr + 'T' + timeStr + ':00.000Z';
      pauses.push({ start: pauseStart, end: null });
      saveOrderPauses(order.id, pauses);
    }
    
    saveState();
    toast("Смена завершена в " + t + (activeOrders.length > 0 ? ", заказы на паузе" : ""));
    renderCalendar();
    renderProgress();
  };
  container.querySelectorAll(".day-cell:not(.empty):not(.future)").forEach(function(cell) {
    cell.onclick = function() {
      var date = this.dataset.date;
      if (!date) return;
      openDayDetail(date);
    };
  });
  document.getElementById("popupCloseBtn").onclick = function() {
    document.getElementById("dayDetailPopup").classList.remove("open");
  };
  
  document.getElementById("popupAddPauseBtn").onclick = function() {
    if (!popupDate) return;
    var wd = getDayWork(popupDate);
    if (!wd.pauses) wd.pauses = [];
    wd.pauses.push({ start: "", end: "" });
    state.workDays[popupDate] = wd;
    openDayDetail(popupDate);
  };
  
  document.getElementById("popupSaveBtn").onclick = function() {
    if (!popupDate) return;
    var start = document.getElementById("popupStartTime").value.trim();
    var end = document.getElementById("popupEndTime").value.trim();
    var wd = getDayWork(popupDate) || {};
    
    var pauseItems = document.querySelectorAll(".popup-pause-item");
    var pauses = [];
    for (var i = 0; i < pauseItems.length; i++) {
      var item = pauseItems[i];
      var ps = item.querySelector(".pause-start-input").value.trim();
      var pe = item.querySelector(".pause-end-input").value.trim();
      if (ps && pe) {
        pauses.push({ start: ps, end: pe });
      }
    }
    wd.pauses = pauses;
    
    if (start && end) {
      if (parseTime(end) <= parseTime(start)) {
        toast("Конец смены должен быть позже начала");
        return;
      }
      wd.start = start;
      wd.end = end;
      wd.pausedAt = "";
    } else if (start && !end) {
      wd.start = start;
      wd.end = "";
      wd.pausedAt = "";
    } else if (!start && end) {
      toast("Укажите начало смены");
      return;
    } else {
      delete state.workDays[popupDate];
      saveState();
      document.getElementById("dayDetailPopup").classList.remove("open");
      toast("День очищен");
      renderCalendar();
      return;
    }
    state.workDays[popupDate] = wd;
    saveState();
    document.getElementById("dayDetailPopup").classList.remove("open");
    toast("Данные сохранены");
    renderCalendar();
  };
  document.getElementById("popupClearBtn").onclick = function() {
    if (!popupDate) return;
    if (!confirm("Очистить все данные за этот день?")) return;
    delete state.workDays[popupDate];
    saveState();
    document.getElementById("dayDetailPopup").classList.remove("open");
    toast("День очищен");
    renderCalendar();
  };
}

var popupDate = null;

function openDayDetail(dateISO) {
  popupDate = dateISO;
  var dObj = parseDate(dateISO);
  var title = dObj.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  document.getElementById("popupDateTitle").textContent = title;
  var wd = getDayWork(dateISO);
  document.getElementById("popupStartTime").value = wd.start || "";
  document.getElementById("popupEndTime").value = wd.end || "";
  
  var statusEl = document.getElementById("popupShiftStatus");
  var statusText = "Не начата";
  if (wd.start && wd.end) statusText = "✅ Завершена";
  else if (wd.start && wd.pausedAt) statusText = "⏸ На паузе (с " + wd.pausedAt + ")";
  else if (wd.start) statusText = "🟢 Работает";
  statusEl.textContent = statusText;
  
  var pauses = wd.pauses || [];
  var container = document.getElementById("popupPausesContainer");
  if (pauses.length === 0) {
    container.innerHTML = '<div class="pause-empty">Нет пауз. Нажмите "+ Добавить"</div>';
  } else {
    var html = "";
    for (var i = 0; i < pauses.length; i++) {
      var p = pauses[i];
      html += '<div class="popup-pause-item" data-index="' + i + '">';
      html += '<div class="popup-pause-row">';
      html += '<div class="popup-pause-col">';
      html += '<label>Начало</label>';
      html += '<input type="text" class="pause-start-input" value="' + escapeHtml(p.start || "") + '" placeholder="10:00" maxlength="5">';
      html += '</div>';
      html += '<div class="popup-pause-col">';
      html += '<label>Окончание</label>';
      html += '<input type="text" class="pause-end-input" value="' + escapeHtml(p.end || "") + '" placeholder="18:00" maxlength="5">';
      html += '</div>';
      html += '<div class="popup-pause-actions">';
      html += '<button class="small danger pause-delete-btn" data-index="' + i + '">✕</button>';
      html += '</div>';
      html += '</div>';
      html += '</div>';
    }
    container.innerHTML = html;
    
    container.querySelectorAll('.pause-delete-btn').forEach(function(btn) {
      btn.onclick = function() {
        var index = parseInt(this.dataset.index);
        var pauses = getDayWork(popupDate).pauses || [];
        pauses.splice(index, 1);
        var wd = getDayWork(popupDate);
        wd.pauses = pauses;
        state.workDays[popupDate] = wd;
        openDayDetail(popupDate);
      };
    });
    
    container.querySelectorAll('.pause-start-input, .pause-end-input').forEach(function(input) {
      input.onblur = function() {
        var val = this.value.trim();
        if (!val) return;
        var parts = val.replace(':', '').split('');
        if (parts.length === 4) {
          this.value = parts.slice(0,2).join('') + ':' + parts.slice(2).join('');
        } else if (parts.length === 3) {
          this.value = parts.slice(0,2).join('') + ':' + parts.slice(2).join('') + '0';
        } else if (parts.length === 2) {
          this.value = parts.join('') + ':00';
        }
      };
      input.oninput = function() {
        var val = this.value;
        if (val.length > 5) this.value = val.slice(0, 5);
      };
    });
  }
  document.getElementById("dayDetailPopup").classList.add("open");
}