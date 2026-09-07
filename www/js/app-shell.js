(function () {
    const menu = document.getElementById('menu-Poseidon');
    const iframe = document.getElementById('app-frame');

    if (!menu || !iframe) {
        console.error('Impossibile inizializzare il menu principale.');
        return;
    }

    if (typeof APP_MODULI === 'undefined') {
        console.error('APP_MODULI non è definito. Controlla il file config.js.');
        return;
    }

    const renderMenu = () => {
        menu.innerHTML = '';

        APP_MODULI.forEach((modulo, index) => {
            const btn = document.createElement('button');
            btn.className = 'nav-btn' + (index === 0 ? ' active' : '');
            btn.innerHTML = `${modulo.icona} ${modulo.titolo}`;

            btn.addEventListener('click', () => {
                document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                iframe.src = modulo.file;
            });

            menu.appendChild(btn);
        });
    };

    renderMenu();

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then((reg) => console.log('Service Worker pronto! App funzionante offline.', reg))
                .catch((err) => console.error('Errore Service Worker', err));
        });
    }
})();
