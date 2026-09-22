(function () {
    async function richiediPermessiAvvio() {
        const nativo = window.Capacitor?.isNativePlatform?.();
        if (!nativo || localStorage.getItem('poseidon_permessi_avvio_richiesti') === '1') return;

        try {
            const notifiche = window.Capacitor?.Plugins?.LocalNotifications;
            if (notifiche) {
                const statoNotifiche = await notifiche.checkPermissions();
                if (statoNotifiche.display !== 'granted') await notifiche.requestPermissions();
            }
        } catch (errore) {
            console.warn('Permesso notifiche non disponibile:', errore);
        }

        try {
            await new Promise((resolve) => {
                if (!navigator.geolocation) return resolve();
                navigator.geolocation.getCurrentPosition(resolve, resolve, {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                });
            });
        } catch (errore) {
            console.warn('Permesso posizione non disponibile:', errore);
        } finally {
            localStorage.setItem('poseidon_permessi_avvio_richiesti', '1');
        }
    }

    window.addEventListener('load', () => {
        richiediPermessiAvvio();
    });

    // Registrazione del Service Worker per il funzionamento Offline (PWA)
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then((reg) => console.log('Service Worker pronto! Poseidon è funzionante offline.', reg))
                .catch((err) => console.error('Errore registrazione Service Worker', err));
        });
    }
})();