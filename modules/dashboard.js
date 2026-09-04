var currentRange = { from: null, to: null, type: 'all' };

function getDefaultRange(type) {
  var now = new Date();
  var from = new Date(now);
  var to = new Date(now);
  var todayStr = toISODate(now);
  switch (type) {
    case 'today':
      from = new Date(todayStr + 'T00:00:00');
      to = new Date(todayStr + 'T23:59:59');
      break;
    case 'week':
      from = new Date(now);
      from.setDate(now.getDate() - 7);
      from.setHours(0, 0, 0, 0);
      to = new Date(now);
      to.setHours(23, 59, 59, 999);
      break;
    case 'month':
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      break;
    case 'custom':
      break;
    default:
      from = null;
      to = null;
  }
  return { from: from, to: to };
}

function setRange(type) {
  currentRange.type = type;
  if (type === 'all') {
    currentRange.from = null;
    currentRange.to = null;
  } else {
    var range = getDefaultRange(type);
    currentRange.from = range.from;
    currentRange.to = range.to;
  }
  renderDashboard();
}

function setCustomRange(from, to) {
  currentRange.type = 'custom';
  currentRange.from = from ? new Date(from + 'T00:00:00') : null;
  currentRange.to = to ? new Date(to + 'T23:59:59') : null;
  renderDashboard();
}

function getOrdersInRange(orders) {
  if (!currentRange.from && !currentRange.to) return orders;
  return orders.filter(function(order) {
    if (!order.endDate) return false;
    var orderEnd = new Date(order.endDate + 'T23:59:59');
    if (currentRange.from && orderEnd < currentRange.from) return false;
    if (currentRange.to && orderEnd > currentRange.to) return false;
    return true;
  });
}

function getWorkDaysInRange() {
  var days = {};
  for (var key in state.workDays) {
    var wd = state.workDays[key];
    if (wd && wd.start && wd.end) {
      var hours = getWorkedHoursForDate(key);
      if (hours > 0) {
        var dDate = parseDate(key);
        if (currentRange.from && dDate < currentRange.from) continue;
        if (currentRange.to && dDate > currentRange.to) continue;
        days[key] = { date: dDate, hours: hours };
      }
    }
  }
  return days;
}

function analyticsWithRange() {
  var months = [];
  for (var i = 0; i < 12; i++) {
    months.push({ month: i, hours: 0, income: 0, days: 0, daily: {} });
  }
  var workDays = getWorkDaysInRange();
  var completedOrders = state.orders.filter(isCompleted);
  var filteredOrders = getOrdersInRange(completedOrders);
  for (var i = 0; i < filteredOrders.length; i++) {
    var order = filteredOrders[i];
    var dailyHours = {};
    var totalOrderHours = 0;
    var workDayCount = 0;
    var start = parseDate(order.startDate);
    var end = parseDate(order.endDate || todayISO());
    for (var d = new Date(start); d <= end; d = addDays(d, 1)) {
      var iso = toISODate(d);
      if (order.status === "in_progress" && iso > todayISO()) continue;
      var hours = 0;
      // Для завершённых заказов используем totalHours, распределённые по дням
      if (order.status === "completed" && order.totalHours) {
        // Простое распределение: часы делятся на количество дней
        var totalDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);
        hours = order.totalHours / totalDays;
      } else {
        // Для активных заказов используем таймер, но в аналитике только завершённые
        hours = 0;
      }
      if (hours > 0 && workDays[iso]) {
        dailyHours[iso] = hours;
        totalOrderHours += hours;
        workDayCount++;
      }
    }
    if (totalOrderHours <= 0 || workDayCount === 0) continue;
    var orderIncome = Number(order.income) || 0;
    var incomePerWorkDay = orderIncome / workDayCount;
    for (var dayIso in dailyHours) {
      var dDate = parseDate(dayIso);
      var m = dDate.getMonth();
      months[m].hours += dailyHours[dayIso];
      months[m].income += incomePerWorkDay;
      months[m].days += 1;
      if (!months[m].daily[dayIso]) {
        months[m].daily[dayIso] = { hours: 0, income: 0, count: 0 };
      }
      months[m].daily[dayIso].hours += dailyHours[dayIso];
      months[m].daily[dayIso].income += incomePerWorkDay;
      months[m].daily[dayIso].count += 1;
    }
  }
  var allWorkDays = getWorkDaysInRange();
  for (var key in allWorkDays) {
    var dDate = allWorkDays[key].date;
    var m = dDate.getMonth();
    months[m].days = Math.max(months[m].days || 0, 1);
  }
  return months;
}

function availableYears() {
  var years = new Set();
  years.add(new Date().getFullYear());
  for (var i = 0; i < state.orders.length; i++) {
    var o = state.orders[i];
    if (o.startDate) years.add(parseDate(o.startDate).getFullYear());
    if (o.endDate) years.add(parseDate(o.endDate).getFullYear());
  }
  for (var key in state.workDays) {
    if (state.workDays[key] && state.workDays[key].start) {
      years.add(parseDate(key).getFullYear());
    }
  }
  var arr = Array.from(years);
  arr.sort(function(a, b) { return b - a; });
  return arr;
}

function fillYearSelects() {
  var years = availableYears();
  var selects = ["yearSelect", "calendarYearSelect"];
  for (var s = 0; s < selects.length; s++) {
    var el = document.getElementById(selects[s]);
    if (!el) continue;
    var current = Number(el.value) || new Date().getFullYear();
    el.innerHTML = "";
    for (var i = 0; i < years.length; i++) {
      var opt = document.createElement("option");
      opt.value = years[i];
      opt.textContent = years[i];
      el.appendChild(opt);
    }
    if (years.indexOf(current) !== -1) el.value = current;
    else if (years.length > 0) el.value = years[0];
  }
}

function renderDashboard() {
  var data = analyticsWithRange();
  var totalHours = 0;
  var totalIncome = 0;
  var maxIncome = 0;
  for (var i = 0; i < data.length; i++) {
    totalHours += data[i].hours;
    totalIncome += data[i].income;
    if (data[i].income > maxIncome) maxIncome = data[i].income;
  }
  var workDaysInRange = getWorkDaysInRange();
  var totalDays = Object.keys(workDaysInRange).length;
  var completedCount = 0;
  var allOrders = state.orders.filter(isCompleted);
  var filteredOrders = getOrdersInRange(allOrders);
  completedCount = filteredOrders.length;
  var heroValue = document.querySelector(".hero-value");
  if (heroValue) heroValue.textContent = money(totalIncome);
  var rangeLabel = "Все время";
  if (currentRange.type === 'today') rangeLabel = "Сегодня";
  else if (currentRange.type === 'week') rangeLabel = "Неделя";
  else if (currentRange.type === 'month') rangeLabel = "Этот месяц";
  else if (currentRange.type === 'custom') {
    var fromStr = currentRange.from ? currentRange.from.toLocaleDateString("ru-RU") : "…";
    var toStr = currentRange.to ? currentRange.to.toLocaleDateString("ru-RU") : "…";
    rangeLabel = fromStr + " — " + toStr;
  }
  var heroMeta = document.querySelector(".hero-meta");
  if (heroMeta) heroMeta.textContent = completedCount + " завершённых заказов · " + formatHoursMinutes(totalHours) + " · " + rangeLabel;
  var kpis = document.querySelectorAll(".kpi strong");
  if (kpis.length >= 4) {
    kpis[0].textContent = formatHoursMinutes(totalHours);
    kpis[1].textContent = money(totalHours ? totalIncome / totalHours : 0);
    kpis[2].textContent = money(totalDays ? totalIncome / totalDays : 0);
    kpis[3].textContent = totalDays;
  }
  var list = document.getElementById("monthsList");
  if (!list) return;
  if (totalHours === 0 && totalIncome === 0) {
    list.innerHTML = '<div class="empty">Нет данных</div>';
    return;
  }
  var html = "";
  if (currentRange.type === 'today' || currentRange.type === 'week' || currentRange.type === 'month' || currentRange.type === 'custom') {
    var dailyData = [];
    for (var m = 0; m < 12; m++) {
      for (var dateKey in data[m].daily) {
        dailyData.push({
          date: dateKey,
          hours: data[m].daily[dateKey].hours,
          income: data[m].daily[dateKey].income,
          count: data[m].daily[dateKey].count
        });
      }
    }
    dailyData.sort(function(a, b) { return a.date.localeCompare(b.date); });
    for (var i = 0; i < dailyData.length; i++) {
      var d = dailyData[i];
      var dateObj = parseDate(d.date);
      var dateStr = dateObj.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
      var pct = maxIncome > 0 ? (d.income / maxIncome) * 100 : 0;
      var perDay = d.hours > 0 ? d.income / d.hours : 0;
      html += '<div class="month-row">';
      html += '<div class="month-name">' + dateStr + '</div>';
      html += '<div class="month-income-cell">';
      html += '<div class="month-income"><strong>' + money(d.income) + '</strong></div>';
      html += '<div class="month-bar-wrapper"><div class="month-bar"><span style="width:' + pct + '%"></span></div></div>';
      html += '</div>';
      html += '<div class="month-stats">';
      html += '<strong>' + formatHoursMinutes(d.hours) + '</strong>';
      html += '<span>' + money(perDay) + '/ч · ' + d.count + ' зак.</span>';
      html += '</div>';
      html += '</div>';
    }
  } else {
    for (var i = 0; i < data.length; i++) {
      var m = data[i];
      var pct = maxIncome > 0 ? (m.income / maxIncome) * 100 : 0;
      var dayAvg = m.days > 0 ? m.income / m.days : 0;
      html += '<div class="month-row">';
      html += '<div class="month-name">' + MONTHS[m.month] + '</div>';
      html += '<div class="month-income-cell">';
      html += '<div class="month-income"><strong>' + money(m.income) + '</strong></div>';
      html += '<div class="month-bar-wrapper"><div class="month-bar"><span style="width:' + pct + '%"></span></div></div>';
      html += '</div>';
      html += '<div class="month-stats">';
      html += '<strong>' + formatHoursMinutes(m.hours) + '</strong>';
      html += '<span>' + money(dayAvg) + ' / день · ' + m.days + ' дн.</span>';
      html += '</div>';
      html += '</div>';
    }
  }
  list.innerHTML = html;
}

function initFilters() {
  var buttons = document.querySelectorAll('.filter-btn');
  buttons.forEach(function(btn) {
    btn.onclick = function() {
      buttons.forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      var range = this.dataset.range;
      var customRange = document.getElementById('customRange');
      if (range === 'custom') {
        customRange.style.display = 'flex';
        setRange('custom');
      } else {
        customRange.style.display = 'none';
        setRange(range);
      }
    };
  });
  document.getElementById('applyCustomRange').onclick = function() {
    var from = document.getElementById('dateFrom').value;
    var to = document.getElementById('dateTo').value;
    if (!from && !to) {
      toast('Выберите даты');
      return;
    }
    setCustomRange(from, to);
  };
  document.getElementById('dateFrom').onchange = function() {
    var to = document.getElementById('dateTo');
    if (this.value && !to.value) {
      to.value = this.value;
    }
  };
  document.getElementById('dateTo').onchange = function() {
    var from = document.getElementById('dateFrom');
    if (this.value && !from.value) {
      from.value = this.value;
    }
  };
}

initFilters();

var allBtn = document.querySelector('.filter-btn[data-range="all"]');
if (allBtn) {
  allBtn.classList.add('active');
} else {
  document.querySelector('.filter-btn[data-range="today"]').classList.add('active');
}

setRange('all');