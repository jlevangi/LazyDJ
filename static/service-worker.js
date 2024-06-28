self.addEventListener('install', event => {
    event.waitUntil(
        caches.open('lazydj-v1').then(cache => {
            return cache.addAll([
                '/',
                '/static/style.css',
                '/static/manifest.json',
                '/static/icons/lazydjicon-192x192.png',
                '/static/icons/lazydjicon-512x512.png'
                // Add other files you want to cache
            ]);
        })
    );
    self.skipWaiting(); // Activate the new service worker immediately
});

self.addEventListener('activate', event => {
    const cacheWhitelist = ['lazydj-v1'];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (!cacheWhitelist.includes(cacheName)) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request).then(fetchResponse => {
                return caches.open('lazydj-v1').then(cache => {
                    cache.put(event.request, fetchResponse.clone());
                    return fetchResponse;
                });
            });
        }).catch(() => caches.match('/fallback.html'))
    );
});
