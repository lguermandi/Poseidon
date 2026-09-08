(function () {
    // Inizializzazione mappa 
    const map = L.map('mappa-container').setView([44.006, 12.657], 13);

    // Layer cartografici (Mappa stradale + Carte Nautiche)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
    L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);

    // Variabili per il plotter manuale
    let arrayWaypoint = [];
    let lineaRotta = null;

    // Variabili per il tracciamento GPS live
    let inNavigazione = false;
    let watchId = null;
    let startTime = null;
    let timerInterval = null;
    let gpsTrack = [];
    let puntiTracciato = []; // Array dedicato per salvare i dati completi per il profilo
    let liveRotta = L.polyline([], {color: '#22c55e', weight: 4}).addTo(map); 
    let liveDistanzaNm = 0;
    let wakeLock = null;

    // --- 1. PLOTTER MANUALE (Attivo solo se il GPS è spento) ---
    map.on('click', function (e) {
        if (inNavigazione) return; 

        const lat = e.latlng.lat;
        const lng = e.latlng.lng;

        arrayWaypoint.push([lat, lng]);

        L.circleMarker([lat, lng], {
            radius: 5,
            color: '#ef4444',
            fillOpacity: 1
        }).addTo(map);

        aggiornaDisegnoRotta();
    });

    function aggiornaDisegnoRotta() {
        if (lineaRotta) map.removeLayer(lineaRotta);

        lineaRotta = L.polyline(arrayWaypoint, {
            color: '#ef4444',
            weight: 3,
            dashArray: '5, 10'
        }).addTo(map);

        let totaleMetri = 0;
        if (arrayWaypoint.length > 1) {
            for (let i = 0; i < arrayWaypoint.length - 1; i += 1) {
                const puntoA = L.latLng(arrayWaypoint[i]);
                const puntoB = L.latLng(arrayWaypoint[i + 1]);
                totaleMetri += map.distance(puntoA, puntoB);
            }
        }

        const migliaNautiche = totaleMetri / 1852;
        document.getElementById('distanza-totale').textContent = migliaNautiche.toFixed(2);
    }

    // --- 2. TRACCIAMENTO GPS SATELLITARE ---
    // Aggiungi queste variabili in alto, vicino alle altre
    let bgWatcherId = null;
    const isNativo = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();

    // --- NUOVO TRACCIAMENTO IBRIDO (Background + Web) ---
    function toggleNavigazione() {
        const btn = document.getElementById("btn-naviga");

        if (!inNavigazione) {
            inNavigazione = true;
            gpsTrack = [];
            puntiTracciato = []; 
            liveDistanzaNm = 0;
            liveRotta.setLatLngs([]);
            cancellaRotta(); 

            btn.innerHTML = "⏹ Ferma Navigazione";
            btn.style.background = "#ef4444";
            startTime = Date.now();
            timerInterval = setInterval(aggiornaTimer, 1000);

            if (isNativo) {
                // Sull'APK Android: Avvia il servizio in background con notifica di sistema fissa
                window.Capacitor.Plugins.BackgroundGeolocation.addWatcher({
                    backgroundTitle: "Poseidon Navigazione",
                    backgroundMessage: "Registrazione rotta in corso. L'app sta funzionando in background.",
                    requestPermissions: true,
                    stale: false,
                    distanceFilter: 2 // Registra un punto ogni 2 metri
                }, function(location, error) {
                    if (!error) elaboraCoordinate(location.latitude, location.longitude, location.speed);
                }).then(id => { bgWatcherId = id; });
            } else {
                // Sul PC: Usa il classico tracciamento web 
                if (navigator.geolocation) {
                    watchId = navigator.geolocation.watchPosition(
                        (pos) => elaboraCoordinate(pos.coords.latitude, pos.coords.longitude, pos.coords.speed),
                        (err) => console.warn("Attesa segnale GPS...", err),
                        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
                    );
                } else {
                    alert("Sensore GPS non trovato.");
                }
            }
        } else {
            inNavigazione = false;
            btn.innerHTML = "▶ Inizia Navigazione";
            btn.style.background = "#22c55e";

            clearInterval(timerInterval);

            // Spegne il GPS in base alla piattaforma
            if (isNativo && bgWatcherId) {
                window.Capacitor.Plugins.BackgroundGeolocation.removeWatcher({ id: bgWatcherId });
                bgWatcherId = null;
            } else if (watchId !== null) {
                navigator.geolocation.clearWatch(watchId);
            }

            salvaRotta();
        }
    }

    // Funzione universale che elabora i punti satellitari per entrambi i sistemi
    function elaboraCoordinate(lat, lng, speedMs) {
        const speedKnots = (speedMs || 0) * 1.94384; 
        const time = new Date().toISOString();
        const nuovoPunto = L.latLng(lat, lng);

        if (gpsTrack.length > 0) {
            const ultimoPunto = gpsTrack[gpsTrack.length - 1];
            liveDistanzaNm += (ultimoPunto.distanceTo(nuovoPunto) / 1852);
        }

        gpsTrack.push(nuovoPunto);
        liveRotta.addLatLng(nuovoPunto);
        map.panTo(nuovoPunto); 

        puntiTracciato.push({ lat: lat, lon: lng, vel: speedKnots, time: time });

        document.getElementById("distanza-totale").innerText = liveDistanzaNm.toFixed(2);
        const nodoVelocita = document.getElementById("velocita-attuale");
        if (nodoVelocita) nodoVelocita.innerText = speedKnots.toFixed(1);
    }

    function aggiornaTimer() {
        const diff = Math.floor((Date.now() - startTime) / 1000);
        const m = Math.floor(diff / 60).toString().padStart(2, '0');
        const s = (diff % 60).toString().padStart(2, '0');
        const nodoTempo = document.getElementById("tempo-trascorso");
        if (nodoTempo) nodoTempo.innerText = `${m}:${s}`;
    }

    function salvaRotta() {
        if (puntiTracciato.length < 2) {
            alert("Rotta troppo breve per essere salvata.");
            return; 
        }

        const oggi = new Date();
        const dataFormattata = oggi.toLocaleDateString('it-IT') + " " + oggi.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'});

        // Struttura corretta richiesta da profilo.html
        const nuovaRotta = {
            id: Date.now(),
            nome: "Rotta del " + dataFormattata,
            data: dataFormattata,
            punti: puntiTracciato 
        };

        const rotteEsistenti = JSON.parse(localStorage.getItem("navigazione_rotte") || "[]");
        rotteEsistenti.push(nuovaRotta);
        localStorage.setItem("navigazione_rotte", JSON.stringify(rotteEsistenti));

        alert("Navigazione terminata. Rotta salvata nel Profilo e pronta per l'export in GPX!");
    }

    function cancellaRotta() {
        if (inNavigazione) {
            alert("Sospendi la Navigazione in corso prima di cestinare la rotta.");
            return;
        }

        map.eachLayer((layer) => {
            if (layer instanceof L.Polyline || layer instanceof L.CircleMarker) {
                layer.remove();
            }
        });

        arrayWaypoint = [];
        lineaRotta = null;
        liveRotta = L.polyline([], {color: '#22c55e', weight: 4}).addTo(map);

        document.getElementById('distanza-totale').textContent = '0.00';
        const vAtt = document.getElementById('velocita-attuale');
        if (vAtt) vAtt.textContent = '0.0';
        const tTras = document.getElementById('tempo-trascorso');
        if (tTras) tTras.textContent = '00:00';
    }

    function salvaRottaManuale() {
        if (arrayWaypoint.length < 2) {
            alert("Traccia almeno 2 punti sulla mappa per salvare una rotta pianificata.");
            return;
        }

        const oggi = new Date();
        const dataFormattata = oggi.toLocaleDateString('it-IT') + " " + oggi.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'});

        // Trasforma i clic manuali nel formato richiesto dal Profilo
        const puntiFormattati = arrayWaypoint.map(wp => ({
            lat: wp[0],
            lon: wp[1],
            vel: 0, // Nessuna velocità per le rotte tracciate a mano
            time: new Date().toISOString()
        }));

        const nuovaRotta = {
            id: Date.now(),
            nome: "Rotta Pianificata a mano",
            data: dataFormattata,
            punti: puntiFormattati 
        };

        const rotteEsistenti = JSON.parse(localStorage.getItem("navigazione_rotte") || "[]");
        rotteEsistenti.push(nuovaRotta);
        localStorage.setItem("navigazione_rotte", JSON.stringify(rotteEsistenti));

        alert("Rotta pianificata salvata con successo nel Profilo!");
    }
    
    async function mantieniSchermoAcceso() {
        if ('wakeLock' in navigator) {
            try {
                wakeLock = await navigator.wakeLock.request('screen');
                console.log('Schermo bloccato: navigazione continua assicurata.');
                
                // Se riduci l'app a icona e poi la riapri, Android fa cadere il blocco.
                // Questo comando lo riattiva automaticamente appena torni sull'app.
                document.addEventListener('visibilitychange', async () => {
                    if (wakeLock !== null && document.visibilityState === 'visible') {
                        wakeLock = await navigator.wakeLock.request('screen');
                    }
                });
            } catch (err) {
                console.error('Impossibile bloccare lo schermo:', err);
            }
        }
    }

    function rilasciaSchermo() {
        if (wakeLock !== null) {
            wakeLock.release().then(() => {
                wakeLock = null;
            });
        }
    }

    // Esponi la funzione all'HTML
    window.salvaRottaManuale = salvaRottaManuale;
    window.cancellaRotta = cancellaRotta;
    window.toggleNavigazione = toggleNavigazione;
})();