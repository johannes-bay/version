/**
 * Service Worker — v4 Parametric Design Platform
 * Cache-first strategy for full offline support.
 */

const CACHE_NAME = 'v4-cache-v4';

// Core files precached on install. Schemas cached on first access.
const PRECACHE_URLS = [
  './',
  './index.html',
  './ui/configurator.js',
  './ui/three-viewer.js',
  './core/formula-engine.js',
  './core/xenos-bridge.js',
  './core/schema-store.js',
  './core/geometry-builder.js',
  './ui/graph-view.js',
  './schemas/registry.json',
  './geometry/laptop-stand-shader.js',
  './geometry/laptop-stand-preview.js',
  './geometry/iso-screw-preview.js',
  './geometry/laptop-stand.js',
  './geometry/iso-screw.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
];

// Install: pre-cache all local files + Three.js
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches, claim clients
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: cache-first, cache new successful GETs (covers lazy-loaded JSCAD)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
