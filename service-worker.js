/*
 * Service Worker — UAE Site Permit & Gate Pass Tracker
 * Aggressively caches the app shell (HTML/CSS/JS/manifest/icons) and the
 * Leaflet map library so the app keeps working with zero signal at remote
 * pumping stations, cooling plants, and security gates. Map tiles are cached
 * as they are viewed (network-first) so previously seen map areas remain
 * available offline; new/unseen tiles will show the app's own
 * "Map offline" fallback instead of a broken image.
 */

var CACHE_NAME = "uae-permit-tracker-v1";
var TILE_CACHE = "uae-permit-tracker-tiles-v1";

var APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        // Cache each asset individually so one failed CDN fetch
        // (e.g. offline during first install) doesn't block the rest.
        return Promise.all(
          APP_SHELL.map(function (url) {
            return cache.add(url).catch(function (err) {
              console.warn("SW: could not pre-cache", url, err);
            });
          })
        );
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) { return key !== CACHE_NAME && key !== TILE_CACHE; })
          .map(function (key) { return caches.delete(key); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

function isMapTileRequest(url) {
  return /tile\.openstreetmap\.org/.test(url) ||
    /\{s\}\.tile/.test(url) ||
    /basemaps\.cartocdn\.com/.test(url) ||
    /arcgisonline\.com/.test(url);
}

// Network-first for live map tiles, falling back to whatever was cached
// before. If neither is available the app's own JS shows the
// "Map offline" text fallback instead of a broken tile.
function networkFirstTile(request) {
  return fetch(request)
    .then(function (response) {
      var copy = response.clone();
      caches.open(TILE_CACHE).then(function (cache) { cache.put(request, copy); });
      return response;
    })
    .catch(function () {
      return caches.match(request);
    });
}

// Cache-first for the app shell and the Leaflet library: instant load,
// always available offline, refreshed in the background when online.
function cacheFirstShell(request) {
  return caches.match(request).then(function (cached) {
    var networkFetch = fetch(request)
      .then(function (response) {
        if (response && response.status === 200) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      })
      .catch(function () { return cached; });
    return cached || networkFetch;
  });
}

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;

  if (isMapTileRequest(request.url)) {
    event.respondWith(networkFirstTile(request));
    return;
  }

  event.respondWith(cacheFirstShell(request));
});
