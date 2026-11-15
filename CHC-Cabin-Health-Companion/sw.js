/* Offline support when the app is opened from a web address (the Python server or a hosted copy).
 * Keeps a copy of the app files so it opens without a connection. Opening index.html directly from a
 * folder is already offline and does not use this file. Bump VERSION when files change. */
var VERSION = "chc-v10";
var FILES = [
  "./", "index.html", "css/style.css", "img/logo.png", "img/chc-logo.svg", "img/icon-32.png", "img/icon-180.png", "img/icon-192.png", "img/icon-512.png", "manifest.webmanifest",
  "js/config.js", "js/data.js", "js/derived.js", "js/status.js", "js/curiosity-rad.js", "js/sample.js", "js/charts.js",
  "js/body.js", "js/reaction.js", "js/diagnose.js", "js/ai.js", "js/wellbeing.js", "js/app.js"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; /* Ollama and anything else: straight through */
  if (url.pathname.indexOf("/api/live") === 0 || url.pathname.indexOf("/api/status") === 0) return; /* live data: never cached */
  if (url.pathname.indexOf("/api/") === 0) {
    /* data: use the network, keep the last copy for offline */
    e.respondWith(fetch(e.request).then(function (r) {
      var copy = r.clone(); caches.open(VERSION).then(function (c) { c.put(e.request, copy); }); return r;
    }).catch(function () { return caches.match(e.request); }));
    return;
  }
  /* app files: network first so updates show up, cached copy when offline */
  e.respondWith(fetch(e.request).then(function (r) {
    if (r.ok) { var copy = r.clone(); caches.open(VERSION).then(function (c) { c.put(e.request, copy); }); }
    return r;
  }).catch(function () { return caches.match(e.request, { ignoreSearch: true }).then(function (m) { return m || caches.match("index.html"); }); }));
});
