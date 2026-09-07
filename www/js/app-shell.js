(function () {
    // Registrazione del Service Worker per il funzionamento Offline (PWA)
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then((reg) => console.log('Service Worker pronto! Poseidon è funzionante offline.', reg))
                .catch((err) => console.error('Errore registrazione Service Worker', err));
        });
    }
})();