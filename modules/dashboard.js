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

// ============================================================
// АНАЛИТИКА
// hours      — часы смены из календаря (workDays)
// orderHours — часы, потраченные на заказы (totalHours заказов)
// income     — доход по завершённым заказам
// days       — уникальные рабочие дни (со сменой)
// daily[iso] = { hours, orderHours, income, count }
// ============================================================
function analyticsWithRange() {
  var months = [];
  for (var i = 0; i < 12; i++) {
    months.push({
      month: i,
      hours: 0,
      orderHours: 0,
      income: 0,
      days: 0,
      daily: {},
      seenDays: {}
    });
  }

  // 1. Часы смен и рабочие дни — из календаря
  var workDays = getWorkDaysInRange();
  for (var iso in workDays) {
    var d = parseDate(iso);
    var m = d.getMonth();
    var h = workDays[iso].hours;
    months[m].hours += h;
    if (!months[m].seenDays[iso]) {
      months[m].seenDays[iso] = true;
      months[m].days += 1;
    }
    if (!months[m].daily[iso]) {
      months[m].daily[iso] = { hours: 0, orderHours: 0, income: 0, count: 0 };
    }
    months[m].daily[iso].hours += h;
  }

  // 2. Завершённые заказы в периоде: часы на заказах + доход
  var completedOrders = state.orders.filter(isCompleted);
  var filteredOrders = getOrdersInRange(completedOrders);

  for (var i = 0; i < filteredOrders.length; i++) {
    var order = filteredOrders[i];
    var orderIncome = Number(order.income) || 0;
    var orderTotalHours = Number(order.totalHours) || 0;

    // Дни заказа, попавшие в рабочие дни
    var orderWorkDays = [];
    var start = parseDate(order.startDate);
    var end = parseDate(order.endDate || order.startDate);
    for (var d = new Date(start); d <= end; d = addDays(d, 1)) {
      var iso = toISODate(d);
      if (workDays[iso]) orderWorkDays.push(iso);
    }
    if (orderWorkDays.length === 0) continue;

    // Часы заказа делим на его рабочие дни
    var hoursPerDay = orderTotalHours / orderWorkDays.length;
    var incomePerDay = orderIncome / orderWorkDays.length;

    for (var j = 0; j < orderWorkDays.length; j++) {
      var iso = orderWorkDays[j];
      var m = parseDate(iso).getMonth();
      if (!months[m].daily[iso]) {
        months[m].daily[iso] = { hours: 0, orderHours: 0, income: 0, count: 0 };
      }
      months[m].daily[iso].orderHours += hoursPerDay;
      months[m].daily[iso].income += incomePerDay;
      months[m].daily[iso].count += 1;
      months[m].orderHours += hoursPerDay;
      months[m].income += incomePerDay;
    }
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
  var totalHours = 0;       // часы смен (календарь)
  var totalOrderHours = 0;  // часы на заказах
  var totalIncome = 0;
  var maxIncome = 0;
  for (var i = 0; i < data.length; i++) {
    totalHours += data[i].hours;
    totalOrderHours += data[i].orderHours;
    totalIncome += data[i].income;
    if (data[i].income > maxIncome) maxIncome = data[i].income;
  }

  var workDaysInRange = getWorkDaysInRange();
  var totalDays = Object.keys(workDaysInRange).length;

  var allOrders = state.orders.filter(isCompleted);
  var filteredOrders = getOrdersInRange(allOrders);
  var completedCount = filteredOrders.length;

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
  if (heroMeta) {
    heroMeta.textContent = completedCount + " завершённых заказов · " +
      formatHoursMinutes(totalHours) + " смен · " +
      formatHoursMinutes(totalOrderHours) + " на заказах · " + rangeLabel;
  }

  // KPI: Часы смен | Часы на заказах | Доход/час | Доход/день | Дней
  var kpis = document.querySelectorAll(".kpi strong");
  if (kpis.length >= 4) {
    kpis[0].textContent = formatHoursMinutes(totalHours);
    kpis[1].textContent = formatHoursMinutes(totalOrderHours);
    kpis[2].textContent = money(totalHours ? totalIncome / totalHours : 0);
    kpis[3].textContent = totalDays;
  }

  var list = document.getElementById("monthsList");
  if (!list) return;
  if (totalHours === 0 && totalIncome === 0 && totalOrderHours === 0) {
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
          orderHours: data[m].daily[dateKey].orderHours,
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
      var perHour = d.hours > 0 ? d.income / d.hours : 0;

      html += '<div class="month-row">';
      html += '<div class="month-name">' + dateStr + '</div>';
      html += '<div class="month-income-cell">';
      html += '<div class="month-income"><strong>' + money(d.income) + '</strong></div>';
      html += '<div class="month-bar-wrapper"><div class="month-bar"><span style="width:' + pct + '%"></span></div></div>';
      html += '</div>';
      html += '<div class="month-stats">';
      html += '<strong>' + formatHoursMinutes(d.hours) + ' смена</strong>';
      html += '<span>' + formatHoursMinutes(d.orderHours) + ' заказы · ' + money(perHour) + '/ч · ' + d.count + ' зак.</span>';
      html += '</div>';
      html += '</div>';
    }
  } else {
    for (var i = 0; i < data.length; i++) {
      var m = data[i];
      var pct = maxIncome > 0 ? (m.income / maxIncome) * 100 : 0;
      var dayAvg = m.days > 0 ? m.income / m.days : 0;
      var hourAvg = m.hours > 0 ? m.income / m.hours : 0;

      html += '<div class="month-row">';
      html += '<div class="month-name">' + MONTHS[m.month] + '</div>';
      html += '<div class="month-income-cell">';
      html += '<div class="month-income"><strong>' + money(m.income) + '</strong></div>';
      html += '<div class="month-bar-wrapper"><div class="month-bar"><span style="width:' + pct + '%"></span></div></div>';
      html += '</div>';
      html += '<div class="month-stats">';
      html += '<strong>' + formatHoursMinutes(m.hours) + ' смена</strong>';
      html += '<span>' + formatHoursMinutes(m.orderHours) + ' заказы · ' + money(hourAvg) + '/ч · ' + m.days + ' дн.</span>';
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