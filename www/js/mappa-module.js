(function () {
    const map = L.map('mappa-container', { zoomControl: false }).setView([44.006, 12.657], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
    L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);

    let arrayWaypoint = [];
    let lineaRotta = null;

    let inNavigazione = false;
    let bgWatcherId = null;
    let watchId = null;
    let startTime = null;
    let timerInterval = null;
    let gpsTrack = [];
    let puntiTracciato = []; 
    let liveRotta = L.polyline([], {color: '#22c55e', weight: 4}).addTo(map); 
    let liveDistanzaNm = 0;
    let ultimoPuntoRilevato = null;
    let wakeLock = null; // Variabile essenziale per lo schermo[cite: 4]

    const isNativo = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform(); //[cite: 4]

    // --- 1. PLOTTER MANUALE ---
    map.on('click', function (e) {
        if (inNavigazione) return; 
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        arrayWaypoint.push([lat, lng]); //[cite: 4]

        L.circleMarker([lat, lng], { radius: 5, color: '#ef4444', fillOpacity: 1 }).addTo(map); //[cite: 4]
        aggiornaDisegnoRotta(); //[cite: 4]
    });

    function aggiornaDisegnoRotta() {
        if (lineaRotta) map.removeLayer(lineaRotta); //[cite: 4]
        lineaRotta = L.polyline(arrayWaypoint, { color: '#ef4444', weight: 3, dashArray: '5, 10' }).addTo(map); //[cite: 4]

        let totaleMetri = 0; //[cite: 4]
        if (arrayWaypoint.length > 1) { //[cite: 4]
            for (let i = 0; i < arrayWaypoint.length - 1; i += 1) { //[cite: 4]
                const puntoA = L.latLng(arrayWaypoint[i]); //[cite: 4]
                const puntoB = L.latLng(arrayWaypoint[i + 1]); //[cite: 4]
                totaleMetri += map.distance(puntoA, puntoB); //[cite: 4]
            }
        }
        const migliaNautiche = totaleMetri / 1852; //[cite: 4]
        document.getElementById('distanza-totale').textContent = migliaNautiche.toFixed(2); //[cite: 4]
    }

    // --- 2. TRACCIAMENTO SATELLITARE (Diviso per la nuova UI) ---
    window.avviaGPS = function() {
        inNavigazione = true;
        gpsTrack = [];
        puntiTracciato = []; 
        liveDistanzaNm = 0;
        liveRotta.setLatLngs([]);
        window.cancellaRotta(true); // true = pulizia silenziosa senza allarmi

        mantieniSchermoAcceso(); // Riattivato lo scudo antisospensione

        startTime = Date.now();
        timerInterval = setInterval(aggiornaTimer, 1000);

        if (isNativo) { //[cite: 4]
            window.Capacitor.Plugins.BackgroundGeolocation.addWatcher({ //[cite: 4]
                backgroundTitle: "Poseidon Navigazione", //[cite: 4]
                backgroundMessage: "Registrazione rotta in corso.", //[cite: 4]
                requestPermissions: true, //[cite: 4]
                stale: false, //[cite: 4]
                distanceFilter: 2  //[cite: 4]
            }, function(location, error) { //[cite: 4]
                if (!error) elaboraCoordinate(location.latitude, location.longitude, location.speed); //[cite: 4]
            }).then(id => { bgWatcherId = id; }); //[cite: 4]
        } else {
            if (navigator.geolocation) { //[cite: 4]
                watchId = navigator.geolocation.watchPosition( //[cite: 4]
                    (pos) => elaboraCoordinate(pos.coords.latitude, pos.coords.longitude, pos.coords.speed), //[cite: 4]
                    (err) => console.warn("Attesa segnale GPS..."),
                    { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 } //[cite: 4]
                );
            }
        }
    };

    window.fermaGPS = function() {
        inNavigazione = false;
        clearInterval(timerInterval);

        rilasciaSchermo(); // Disattiva lo scudo antisospensione per risparmiare batteria

        if (isNativo && bgWatcherId) { //[cite: 4]
            window.Capacitor.Plugins.BackgroundGeolocation.removeWatcher({ id: bgWatcherId }); //[cite: 4]
            bgWatcherId = null; //[cite: 4]
        } else if (watchId !== null) { //[cite: 4]
            navigator.geolocation.clearWatch(watchId); //[cite: 4]
        }
    };

    function elaboraCoordinate(lat, lng, speedMs) { //[cite: 4]
        const speedKnots = (speedMs || 0) * 1.94384;  //[cite: 4]
        const time = new Date().toISOString(); //[cite: 4]
        ultimoPuntoRilevato = L.latLng(lat, lng); 

        if (gpsTrack.length > 0) { //[cite: 4]
            const ultimoPunto = gpsTrack[gpsTrack.length - 1]; //[cite: 4]
            liveDistanzaNm += (ultimoPunto.distanceTo(ultimoPuntoRilevato) / 1852); //[cite: 4]
        }

        gpsTrack.push(ultimoPuntoRilevato); //[cite: 4]
        liveRotta.addLatLng(ultimoPuntoRilevato); //[cite: 4]
        map.panTo(ultimoPuntoRilevato);  //[cite: 4]

        puntiTracciato.push({ lat: lat, lon: lng, vel: speedKnots, time: time }); //[cite: 4]

        document.getElementById("distanza-totale").innerText = liveDistanzaNm.toFixed(2); //[cite: 4]
        const nodoVelocita = document.getElementById("velocita-attuale"); //[cite: 4]
        if (nodoVelocita) nodoVelocita.innerText = speedKnots.toFixed(1); //[cite: 4]
    }

    function aggiornaTimer() { //[cite: 4]
        const diff = Math.floor((Date.now() - startTime) / 1000); //[cite: 4]
        const m = Math.floor(diff / 60).toString().padStart(2, '0'); //[cite: 4]
        const s = (diff % 60).toString().padStart(2, '0'); //[cite: 4]
        document.getElementById("tempo-trascorso").innerText = `${m}:${s}`;
    }

    // --- 3. WAKE LOCK (Scudo Antisospensione) ---
    async function mantieniSchermoAcceso() { //[cite: 4]
        if ('wakeLock' in navigator) { //[cite: 4]
            try {
                wakeLock = await navigator.wakeLock.request('screen'); //[cite: 4]
                console.log('Schermo bloccato: navigazione continua assicurata.'); //[cite: 4]
                
                document.addEventListener('visibilitychange', async () => { //[cite: 4]
                    if (wakeLock !== null && document.visibilityState === 'visible') { //[cite: 4]
                        wakeLock = await navigator.wakeLock.request('screen'); //[cite: 4]
                    }
                });
            } catch (err) { //[cite: 4]
                console.error('Impossibile bloccare lo schermo:', err); //[cite: 4]
            }
        }
    }

    function rilasciaSchermo() { //[cite: 4]
        if (wakeLock !== null) { //[cite: 4]
            wakeLock.release().then(() => { //[cite: 4]
                wakeLock = null; //[cite: 4]
            });
        }
    }

    // --- 4. SALVATAGGIO E GESTIONE MEMORIA ---
    window.salvaRotta = function() {
        if (puntiTracciato.length < 2) { //[cite: 4]
            alert("Rotta troppo breve per essere salvata."); //[cite: 4]
            window.cancellaRotta();
            return;  //[cite: 4]
        }

        const oggi = new Date(); //[cite: 4]
        const dataFormattata = oggi.toLocaleDateString('it-IT') + " " + oggi.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'}); //[cite: 4]

        const nuovaRotta = { //[cite: 4]
            id: Date.now(), //[cite: 4]
            nome: "Rotta del " + dataFormattata, //[cite: 4]
            data: dataFormattata, //[cite: 4]
            punti: puntiTracciato  //[cite: 4]
        };

        const rotteEsistenti = JSON.parse(localStorage.getItem("navigazione_rotte") || "[]"); //[cite: 4]
        rotteEsistenti.push(nuovaRotta); //[cite: 4]
        localStorage.setItem("navigazione_rotte", JSON.stringify(rotteEsistenti)); //[cite: 4]
        
        window.cancellaRotta();
    };

    window.salvaRottaManuale = function() { //[cite: 4]
        if (arrayWaypoint.length < 2) { //[cite: 4]
            alert("Traccia almeno 2 punti per salvare una pianificazione."); //[cite: 4]
            return; //[cite: 4]
        }

        const oggi = new Date(); //[cite: 4]
        const dataFormattata = oggi.toLocaleDateString('it-IT') + " " + oggi.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'}); //[cite: 4]

        const puntiFormattati = arrayWaypoint.map(wp => ({ //[cite: 4]
            lat: wp[0], lon: wp[1], vel: 0, time: new Date().toISOString() //[cite: 4]
        }));

        const rotteEsistenti = JSON.parse(localStorage.getItem("navigazione_rotte") || "[]"); //[cite: 4]
        rotteEsistenti.push({ id: Date.now(), nome: "Rotta Pianificata", data: dataFormattata, punti: puntiFormattati }); //[cite: 4]
        localStorage.setItem("navigazione_rotte", JSON.stringify(rotteEsistenti)); //[cite: 4]

        alert("Rotta manuale salvata nel Profilo!"); //[cite: 4]
        window.cancellaRotta();
    };

    window.cancellaRotta = function(silenzioso = false) {
        if (inNavigazione && !silenzioso) {
            alert("Sospendi la Navigazione prima di ripulire la mappa."); //[cite: 4]
            return; //[cite: 4]
        }

        map.eachLayer((layer) => { //[cite: 4]
            if (layer instanceof L.Polyline || layer instanceof L.CircleMarker) layer.remove(); //[cite: 4]
        });

        arrayWaypoint = []; //[cite: 4]
        lineaRotta = null; //[cite: 4]
        liveRotta = L.polyline([], {color: '#22c55e', weight: 4}).addTo(map); //[cite: 4]

        document.getElementById('distanza-totale').textContent = '0.00'; //[cite: 4]
        const vAtt = document.getElementById('velocita-attuale'); //[cite: 4]
        if (vAtt) vAtt.textContent = '0.0'; //[cite: 4]
        const tTras = document.getElementById('tempo-trascorso'); //[cite: 4]
        if (tTras) tTras.textContent = '00:00'; //[cite: 4]
    };

    window.centraMappa = function() {
        if (ultimoPuntoRilevato) {
            map.setView(ultimoPuntoRilevato, 16);
        } else if (arrayWaypoint.length > 0) {
            map.setView(arrayWaypoint[arrayWaypoint.length - 1], 15);
        }
    };
})();