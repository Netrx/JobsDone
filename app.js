document.querySelectorAll(".nav-btn").forEach(function(btn) {
  btn.onclick = function() {
    document.querySelectorAll(".nav-btn").forEach(function(x) {
      x.classList.remove("active");
    });
    document.querySelectorAll(".view").forEach(function(x) {
      x.classList.remove("active");
    });
    btn.classList.add("active");
    document.getElementById(btn.dataset.view).classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
});

document.getElementById("yearSelect").onchange = function() {
  renderDashboard();
};

function renderAll() {
  fillYearSelects();
  renderDashboard();
  renderOrders();
  renderProgress();
  renderCalendar();
  renderSettings();
}

renderAll();

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(function() {});
}

var deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", function(e) {
  e.preventDefault();
  deferredInstallPrompt = e;
  var installBtn = document.getElementById("installBtn");
  if (installBtn) installBtn.classList.remove("hidden");
});

document.getElementById("installBtn").onclick = async function() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  var installBtn = document.getElementById("installBtn");
  if (installBtn) installBtn.classList.add("hidden");
};