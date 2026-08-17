function renderSettings() {
}

function download(name, text, type) {
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: type }));
  a.download = name;
  a.click();
  setTimeout(function() { URL.revokeObjectURL(a.href); }, 1000);
}

document.getElementById("exportBackupBtn").onclick = function() {
  var data = JSON.stringify(state, null, 2);
  download("мебельщик_backup_" + todayISO() + ".json", data, "application/json");
};

document.getElementById("importBackupInput").onchange = function(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    try {
      var data = JSON.parse(ev.target.result);
      if (!Array.isArray(data.orders) || !data.settings) throw new Error();
      state.orders = data.orders;
      state.settings = data.settings;
      state.workDays = data.workDays || {};
      if (data.dailyHours) {
        for (var key in data.dailyHours) {
          if (!state.workDays[key]) {
            state.workDays[key] = {};
          }
          var hours = data.dailyHours[key];
          var startHour = Math.floor(hours);
          var startMin = Math.round((hours - startHour) * 60);
          var endHour = Math.floor(hours);
          var endMin = Math.round((hours - endHour) * 60);
          if (startMin < 10) startMin = "0" + startMin;
          if (endMin < 10) endMin = "0" + endMin;
          var startTime = startHour + ":" + startMin;
          var endTime = endHour + ":" + endMin;
          state.workDays[key].start = startTime;
          state.workDays[key].end = endTime;
          if (!state.workDays[key].pauses) state.workDays[key].pauses = [];
        }
      }
      if (data.weekendHours) {
        for (var key in data.weekendHours) {
          var wh = data.weekendHours[key];
          if (wh.sat > 0 || wh.sun > 0) {
            if (!state.workDays[key]) state.workDays[key] = {};
            if (!state.workDays[key].pauses) state.workDays[key].pauses = [];
          }
        }
      }
      saveState();
      toast("Резервная копия загружена");
    } catch(err) {
      toast("Не удалось прочитать резервную копию");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
};

document.getElementById("resetBtn").onclick = function() {
  if (!confirm("Очистить все данные?")) return;
  state = { orders: [], settings: { standardStart: "10:00", standardEnd: "18:00" }, workDays: {} };
  saveState();
  toast("Все данные очищены");
};

var themeToggle = document.getElementById("themeToggle");
var html = document.documentElement;
var metaTheme = document.querySelector('meta[name="theme-color"]');

if (localStorage.getItem("theme") === "dark") {
  html.setAttribute("data-theme", "dark");
  themeToggle.checked = true;
  if (metaTheme) metaTheme.content = "#121212";
}

themeToggle.addEventListener("change", function() {
  if (themeToggle.checked) {
    html.setAttribute("data-theme", "dark");
    if (metaTheme) metaTheme.content = "#121212";
    localStorage.setItem("theme", "dark");
  } else {
    html.setAttribute("data-theme", "light");
    if (metaTheme) metaTheme.content = "#ffffff";
    localStorage.setItem("theme", "light");
  }
});