const CACHE_NAME = 'neythu-studio-v7';

const STATIC_ASSETS = [
    './',
    './index.html',
    './shop.html',
    './cart.html',
    './about.html',
    './contact.html',
    './faq.html',
    './checkout.html',
    './profile.html',
    './login.html',
    './shipping-policy.html',
    './return-refund-policy.html',
    './cancellation-policy.html',
    './support.html',
    './terms.html',
    './privacy.html',
    './css/style.css',
    './js/nav.js',
    './js/pwa.js',
    './manifest.json',
    './images/neythu_studio_logo.png',
    './images/crochet-pattern.svg',
    './images/icons/icon-72x72.png',
    './images/icons/icon-96x96.png',
    './images/icons/icon-128x128.png',
    './images/icons/icon-144x144.png',
    './images/icons/icon-152x152.png',
    './images/icons/icon-192x192.png',
    './images/icons/icon-384x384.png',
    './images/icons/icon-512x512.png',
    './images/icons/maskable-icon-512x512.png',
    './images/icons/apple-touch-icon.png'
];

// Install Event - Precache App Shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS).catch((err) => {
                console.warn('[PWA ServiceWorker] Pre-cache non-fatal error:', err);
            });
        }).then(() => self.skipWaiting())
    );
});

// Activate Event - Clean up stale caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(
                keyList.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Only handle GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Bypass Firebase API / Firestore / Auth calls
    if (
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('identitytoolkit') ||
        url.hostname.includes('firestore')
    ) {
        return;
    }

    // Navigation requests (HTML pages): Network-First, fallback to cache
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const copy = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return networkResponse;
                })
                .catch(() => {
                    return caches.match(request).then((cachedResponse) => {
                        return cachedResponse || caches.match('./index.html');
                    });
                })
        );
        return;
    }

    // Static assets (CSS, JS, Images, Fonts): Stale-While-Revalidate
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const copy = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return networkResponse;
                })
                .catch(() => {
                    // Offline and not in cache
                    return null;
                });

            return cachedResponse || fetchPromise;
        })
    );
});
