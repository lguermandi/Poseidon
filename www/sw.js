const NOME_CACHE = 'nautica-app-v5';

// Questa è la lista di tutti i file che l'app scaricherà per funzionare offline
const FILE_DA_SALVARE = [
    './',
    './index.html',
    './css/style.css',
    './js/app-shell.js',
    './js/core_navigazione.js',
    './js/core_vela.js',
    './js/mappa-module.js',
    './js/profilo-module.js',
    './js/quiz-module.js',
    './moduli/accademia.html',
    './moduli/home.html',
    './moduli/navigazione.html',
    './moduli/profilo.html',
    './moduli/logbook.html',
    './moduli/carteggio.html',
    './moduli/quiz.html',
    './moduli/vela.html',
    './moduli/mappa.html',
    './moduli/meteo.html',
    './moduli/ancora.html',
    './moduli/fari.html',
    './moduli/maree.html',
    './moduli/motore.html',
    './manifest.json',
    './img/icona.svg',
    'https://unpkg.com/@phosphor-icons/web',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

// FASE 1: Installazione (scarica tutto e lo mette in stiva)
self.addEventListener('install', (evento) => {
    evento.waitUntil(
        caches.open(NOME_CACHE)
            .then((cache) => {
                console.log('Service Worker: File salvati in cache per uso offline');
                return Promise.allSettled(FILE_DA_SALVARE.map((file) => cache.add(file)))
                    .then((risultati) => {
                        const falliti = risultati.filter((risultato) => risultato.status === 'rejected');
                        if (falliti.length > 0) {
                            console.warn(`Service Worker: ${falliti.length} risorse non disponibili offline.`);
                        }
                    });
            })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
    evento.waitUntil(
        caches.keys().then((nomiCache) => Promise.all(
            nomiCache
                .filter((nomeCache) => nomeCache !== NOME_CACHE)
                .map((nomeCache) => caches.delete(nomeCache))
        )).then(() => self.clients.claim())
    );
});

// FASE 2: Ascolto (quando sei offline, pesca i file dalla stiva)
self.addEventListener('fetch', (evento) => {
    if (evento.request.method !== 'GET') return;

    evento.respondWith(
        caches.match(evento.request)
            .then((risposta_offline) => {
                if (risposta_offline) return risposta_offline;

                return fetch(evento.request).catch(() => {
                    // Solo le navigazioni HTML possono usare la home come fallback.
                    if (evento.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }

                    return new Response('', {
                        status: 503,
                        statusText: 'Offline'
                    });
                });
            })
    );
});