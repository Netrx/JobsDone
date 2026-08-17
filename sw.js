var CACHE = "furniture-v2";
var ASSETS = [
  "./",
  "index.html",
  "styles/base.css",
  "styles/dashboard.css",
  "styles/orders.css",
  "styles/progress.css",
  "styles/calendar.css",
  "styles/settings.css",
  "app.js",
  "manifest.json",
  "modules/utils.js",
  "modules/dashboard.js",
  "modules/orders.js",
  "modules/progress.js",
  "modules/calendar.js",
  "modules/settings.js"
];

self.addEventListener("install", function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) {
      return c.addAll(ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) {
          return key !== CACHE;
        }).map(function(key) {
          return caches.delete(key);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function(e) {
  e.respondWith(
    caches.match(e.request).then(function(response) {
      if (response) {
        return response;
      }
      return fetch(e.request).then(function(resp) {
        var copy = resp.clone();
        caches.open(CACHE).then(function(c) {
          c.put(e.request, copy);
        });
        return resp;
      }).catch(function() {
        return caches.match("index.html");
      });
    })
  );
});