var STORAGE_KEY = "worktracker-app-v1";
var MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

var state = loadState();

function loadState() {
  try {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      var parsed = JSON.parse(saved);
      if (parsed.orders && parsed.settings) {
        if (!parsed.workDays) parsed.workDays = {};
        if (!parsed.orderTimers) parsed.orderTimers = {};
        if (!parsed.lastActiveOrder) parsed.lastActiveOrder = null;
        return parsed;
      }
    }
  } catch(e) {
    console.warn("Ошибка загрузки данных, создаем новые:", e);
  }
  return createDefaultState();
}

function createDefaultState() {
  var today = new Date();
  var yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  var yIso = toISODate(yesterday);
  var testOrders = [
    {
      id: "test-1",
      number: "1001",
      startDate: yIso,
      endDate: yIso,
      work: "Сборка конструкции",
      income: 5000,
      comment: "",
      status: "completed",
      totalHours: 8,
      createdAt: new Date().toISOString()
    },
    {
      id: "test-2",
      number: "1002",
      startDate: yIso,
      endDate: yIso,
      work: "Обработка деталей",
      income: 3500,
      comment: "",
      status: "completed",
      totalHours: 7.5,
      createdAt: new Date().toISOString()
    }
  ];
  var testWorkDays = {};
  testWorkDays[yIso] = { start: "10:00", end: "18:00" };
  var testData = {
    orders: testOrders,
    settings: { standardStart: "10:00", standardEnd: "18:00" },
    workDays: testWorkDays,
    orderTimers: {},
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
  if (hoursDecimal === undefined || hoursDecimal === null || isNaN(hoursDecimal)) {
    return "0 ч 0 м";
  }
  var h = Math.floor(hoursDecimal);
  var m = Math.round((hoursDecimal - h) * 60);
  if (h === 0 && m === 0) return "0 ч 0 м";
  if (h === 0) return m + " м";
  if (m === 0) return h + " ч";
  return h + " ч " + m + " м";
}

function formatDuration(seconds) {
  if (seconds < 0) seconds = 0;
  var h = Math.floor(seconds / 3600);
  var m = Math.floor((seconds % 3600) / 60);
  var s = Math.floor(seconds % 60);
  if (h > 0) {
    return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
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

function getDayWork(dateISO) {
  return state.workDays[dateISO] || {};
}

function getWorkedHoursForDate(dateISO) {
  var wd = state.workDays && state.workDays[dateISO];
  if (!wd || !wd.start || !wd.end) return 0;
  var start = parseTime(wd.start);
  var end = parseTime(wd.end);
  return Math.max(0, end - start);
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

// ============================================================
// РАБОТА С ТАЙМЕРАМИ ЗАКАЗОВ
// ============================================================

function getOrderTimer(orderId) {
  if (!state.orderTimers) state.orderTimers = {};
  return state.orderTimers[orderId] || null;
}

function saveOrderTimer(orderId, timerData) {
  if (!state.orderTimers) state.orderTimers = {};
  if (timerData) {
    state.orderTimers[orderId] = timerData;
  } else {
    delete state.orderTimers[orderId];
  }
  saveState();
}

function startOrderTimer(orderId) {
  var now = new Date();
  var timerData = {
    startedAt: now.toISOString(),
    accumulated: 0,
    isRunning: true
  };
  var existing = getOrderTimer(orderId);
  if (existing) {
    if (existing.isRunning) return;
    timerData.accumulated = existing.accumulated || 0;
  }
  saveOrderTimer(orderId, timerData);
  startTimerTick(orderId);
}

function pauseOrderTimer(orderId) {
  var timer = getOrderTimer(orderId);
  if (!timer || !timer.isRunning) return;
  var startTime = new Date(timer.startedAt);
  var now = new Date();
  var elapsed = (now - startTime) / 1000;
  timer.accumulated += elapsed;
  timer.isRunning = false;
  timer.startedAt = null;
  saveOrderTimer(orderId, timer);
  stopTimerTick(orderId);
}

function resumeOrderTimer(orderId) {
  var timer = getOrderTimer(orderId);
  if (!timer) {
    startOrderTimer(orderId);
    return;
  }
  if (timer.isRunning) return;
  timer.startedAt = new Date().toISOString();
  timer.isRunning = true;
  saveOrderTimer(orderId, timer);
  startTimerTick(orderId);
}

function stopOrderTimer(orderId) {
  var timer = getOrderTimer(orderId);
  if (!timer) return;
  if (timer.isRunning) {
    var startTime = new Date(timer.startedAt);
    var now = new Date();
    var elapsed = (now - startTime) / 1000;
    timer.accumulated += elapsed;
  }
  timer.isRunning = false;
  timer.startedAt = null;
  saveOrderTimer(orderId, timer);
  stopTimerTick(orderId);
}

function getOrderTimerSeconds(orderId) {
  var timer = getOrderTimer(orderId);
  if (!timer) return 0;
  var total = timer.accumulated || 0;
  if (timer.isRunning && timer.startedAt) {
    var startTime = new Date(timer.startedAt);
    var now = new Date();
    total += (now - startTime) / 1000;
  }
  return total;
}

function getOrderTimerHours(orderId) {
  return getOrderTimerSeconds(orderId) / 3600;
}

var timerIntervals = {};

function startTimerTick(orderId) {
  stopTimerTick(orderId);
  timerIntervals[orderId] = setInterval(function() {
    var seconds = getOrderTimerSeconds(orderId);
    var hours = seconds / 3600;
    if (typeof updateOrderTimerDisplay === "function") {
      updateOrderTimerDisplay(orderId, hours);
    }
  }, 1000);
}

function stopTimerTick(orderId) {
  if (timerIntervals[orderId]) {
    clearInterval(timerIntervals[orderId]);
    delete timerIntervals[orderId];
  }
}

function stopAllTimers() {
  for (var id in timerIntervals) {
    clearInterval(timerIntervals[id]);
  }
  timerIntervals = {};
}

function calculateOrderHours(order) {
  if (!order) return 0;
  if (order.status === "completed") {
    return order.totalHours || 0;
  }
  return getOrderTimerHours(order.id);
}

// ============================================================
// УПРАВЛЕНИЕ АКТИВНЫМИ ЗАКАЗАМИ
// ============================================================

function getActiveOrderId() {
  var activeOrders = state.orders.filter(function(o) {
    if (o.status !== "in_progress") return false;
    var timer = getOrderTimer(o.id);
    return timer && timer.isRunning;
  });
  if (activeOrders.length === 0) return null;
  return activeOrders[0].id;
}

function getActiveOrder() {
  var id = getActiveOrderId();
  if (!id) return null;
  return state.orders.find(function(o) { return o.id === id; });
}

function pauseAllOtherOrders(orderId) {
  var allOrders = state.orders.filter(function(o) {
    return o.id !== orderId && o.status === "in_progress";
  });
  for (var i = 0; i < allOrders.length; i++) {
    pauseOrderTimer(allOrders[i].id);
  }
}

function stopAllOrders() {
  var allOrders = state.orders.filter(function(o) {
    return o.status === "in_progress";
  });
  for (var i = 0; i < allOrders.length; i++) {
    pauseOrderTimer(allOrders[i].id);
  }
  state.lastActiveOrder = null;
  saveState();
  if (typeof renderProgress === "function") renderProgress();
}

function setActiveOrder(orderId) {
  pauseAllOtherOrders(orderId);
  var timer = getOrderTimer(orderId);
  if (!timer) {
    startOrderTimer(orderId);
  } else if (!timer.isRunning) {
    resumeOrderTimer(orderId);
  }
  setLastActiveOrder(orderId);
  if (typeof renderProgress === "function") renderProgress();
}

function toggleOrderActivity(orderId) {
  var timer = getOrderTimer(orderId);
  var isActive = timer && timer.isRunning;
  if (isActive) {
    pauseOrderTimer(orderId);
    if (typeof renderProgress === "function") renderProgress();
    toast("Заказ на паузе");
  } else {
    pauseAllOtherOrders(orderId);
    if (!timer) {
      startOrderTimer(orderId);
    } else {
      resumeOrderTimer(orderId);
    }
    setLastActiveOrder(orderId);
    if (typeof renderProgress === "function") renderProgress();
    toast("Заказ активирован");
  }
}

function resumeLastActiveOrder() {
  var last = getLastActiveOrder();
  if (!last || !last.id) return;
  var order = state.orders.find(function(o) { return o.id === last.id; });
  if (!order || order.status !== "in_progress") return;
  var timer = getOrderTimer(order.id);
  if (!timer || !timer.isRunning) {
    setActiveOrder(order.id);
  }
}

function setLastActiveOrder(orderId) {
  if (!state.lastActiveOrder) state.lastActiveOrder = {};
  state.lastActiveOrder.id = orderId;
  state.lastActiveOrder.updatedAt = new Date().toISOString();
  saveState();
}

function getLastActiveOrder() {
  return state.lastActiveOrder || null;
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ТАЙМЕРОВ ПРИ ЗАГРУЗКЕ
// ============================================================

function initTimers() {
  var activeOrders = state.orders.filter(function(o) { 
    return o.status === "in_progress"; 
  });
  var runningCount = 0;
  var runningOrderId = null;
  for (var i = 0; i < activeOrders.length; i++) {
    var timer = getOrderTimer(activeOrders[i].id);
    if (timer && timer.isRunning) {
      runningCount++;
      runningOrderId = activeOrders[i].id;
    }
  }
  if (runningCount > 1) {
    for (var i = 0; i < activeOrders.length; i++) {
      pauseOrderTimer(activeOrders[i].id);
    }
    if (runningOrderId) {
      startOrderTimer(runningOrderId);
    }
  }
  if (runningCount === 0) {
    var last = getLastActiveOrder();
    if (last && last.id) {
      var order = state.orders.find(function(o) { return o.id === last.id; });
      if (order && order.status === "in_progress") {
        var timer = getOrderTimer(order.id);
        if (timer && !timer.isRunning) {
          resumeOrderTimer(order.id);
        }
      }
    }
  }
  var allOrders = state.orders.filter(function(o) { return o.status === "in_progress"; });
  for (var i = 0; i < allOrders.length; i++) {
    var timer = getOrderTimer(allOrders[i].id);
    if (timer && timer.isRunning) {
      startTimerTick(allOrders[i].id);
    }
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTimers);
  } else {
    initTimers();
  }
}