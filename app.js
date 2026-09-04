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
  window.addEventListener("load", function() {
    navigator.serviceWorker.register("sw.js")
      .then(function(reg) {
        console.log("SW registered successfully");
        reg.addEventListener("updatefound", function() {
          var installingWorker = reg.installing;
          installingWorker.onstatechange = function() {
            if (installingWorker.state === "installed") {
              if (navigator.serviceWorker.controller) {
                console.log("SW update available");
              }
            }
          };
        });
      })
      .catch(function(err) {
        console.warn("SW registration failed:", err);
      });
  });
}

var deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", function(e) {
  e.preventDefault();
  deferredInstallPrompt = e;
  var installBtn = document.getElementById("installBtn");
  if (installBtn) {
    installBtn.classList.remove("hidden");
    installBtn.textContent = "📲 Установить";
    installBtn.style.display = "block";
  }
  console.log("PWA install prompt available");
});

window.addEventListener("appinstalled", function() {
  var installBtn = document.getElementById("installBtn");
  if (installBtn) {
    installBtn.classList.add("hidden");
    installBtn.textContent = "✅ Установлено";
  }
  deferredInstallPrompt = null;
  toast("Приложение установлено!");
});

document.getElementById("installBtn").onclick = async function() {
  if (!deferredInstallPrompt) {
    toast("Установка недоступна. Откройте страницу в Chrome.");
    return;
  }
  try {
    var installBtn = document.getElementById("installBtn");
    installBtn.textContent = "⏳ Установка...";
    installBtn.disabled = true;
    
    await deferredInstallPrompt.prompt();
    var result = await deferredInstallPrompt.userChoice;
    
    if (result.outcome === "accepted") {
      toast("Приложение устанавливается...");
      installBtn.textContent = "✅ Установлено";
      installBtn.classList.add("hidden");
    } else {
      toast("Установка отменена");
      installBtn.textContent = "📲 Установить";
      installBtn.disabled = false;
    }
    deferredInstallPrompt = null;
  } catch(err) {
    console.error("Install error:", err);
    var installBtn = document.getElementById("installBtn");
    installBtn.textContent = "📲 Установить";
    installBtn.disabled = false;
    toast("Ошибка установки: " + err.message);
  }
};

if (window.matchMedia('(display-mode: standalone)').matches || 
    window.navigator.standalone === true) {
  var installBtn = document.getElementById("installBtn");
  if (installBtn) {
    installBtn.textContent = "✅ Установлено";
    installBtn.classList.add("hidden");
  }
}