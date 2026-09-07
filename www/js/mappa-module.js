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
    let liveRotta = L.polyline([], {color: '#22c55e', weight: 4}).addTo(map); // Linea verde per il GPS
    let liveDistanzaNm = 0;

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
    function toggleNavigazione() {
        const btn = document.getElementById("btn-naviga");

        if (!inNavigazione) {
            // Avvia la registrazione in background
            inNavigazione = true;
            gpsTrack = [];
            liveDistanzaNm = 0;
            liveRotta.setLatLngs([]);
            cancellaRotta(); // Pulisce i waypoint manuali per fare spazio al GPS

            btn.innerHTML = "⏹ Ferma Navigazione";
            btn.style.background = "#ef4444";

            startTime = Date.now();
            timerInterval = setInterval(aggiornaTimer, 1000);

            if (navigator.geolocation) {
                watchId = navigator.geolocation.watchPosition(
                    aggiornaPosizione,
                    (err) => console.error("Errore GPS:", err),
                    { enableHighAccuracy: true, maximumAge: 0 }
                );
            } else {
                alert("Il segnale GPS non è supportato da questo dispositivo.");
            }
        } else {
            // Ferma la Navigazione e salva i dati
            inNavigazione = false;
            btn.innerHTML = "▶ Inizia Navigazione";
            btn.style.background = "#22c55e";

            clearInterval(timerInterval);
            if (watchId !== null) navigator.geolocation.clearWatch(watchId);

            salvaRotta();
        }
    }

    function aggiornaPosizione(pos) {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const speedKnots = (pos.coords.speed || 0) * 1.94384; 

        const nuovoPunto = L.latLng(lat, lng);

        if (gpsTrack.length > 0) {
            const ultimoPunto = gpsTrack[gpsTrack.length - 1];
            const distNm = ultimoPunto.distanceTo(nuovoPunto) / 1852;
            liveDistanzaNm += distNm;
        }

        gpsTrack.push(nuovoPunto);
        liveRotta.addLatLng(nuovoPunto);
        map.panTo(nuovoPunto); // Mantiene il focus sulla tua posizione

        document.getElementById("distanza-totale").innerText = liveDistanzaNm.toFixed(2);
        
        // Se i contatori sono presenti in pagina, li aggiorna
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
        if (liveDistanzaNm <= 0.01) return; // Non salva tracciati falsi o inattivi

        const diffMin = Math.floor((Date.now() - startTime) / 60000);
        const oggi = new Date().toLocaleDateString('it-IT');

        const nuovaRotta = {
            data: oggi,
            durata: diffMin,
            distanza: liveDistanzaNm.toFixed(2)
        };

        const rotteEsistenti = JSON.parse(localStorage.getItem("navigazione_rotte") || "[]");
        rotteEsistenti.push(nuovaRotta);
        localStorage.setItem("navigazione_rotte", JSON.stringify(rotteEsistenti));

        alert("Navigazione terminata e dati salvati con successo nel Profilo.");
    }

    function cancellaRotta() {
        if (inNavigazione) {
            alert("Sospendi la Navigazione in corso prima di cestinare la rotta.");
            return;
        }

        // Pulisce tutti i marker e le linee dal foglio
        map.eachLayer((layer) => {
            if (layer instanceof L.Polyline || layer instanceof L.CircleMarker) {
                layer.remove();
            }
        });

        // Resetta la cache manuale e reinizializza la linea verde per il GPS
        arrayWaypoint = [];
        lineaRotta = null;
        liveRotta = L.polyline([], {color: '#22c55e', weight: 4}).addTo(map);

        document.getElementById('distanza-totale').textContent = '0.00';
        const vAtt = document.getElementById('velocita-attuale');
        if (vAtt) vAtt.textContent = '0.0';
        const tTras = document.getElementById('tempo-trascorso');
        if (tTras) tTras.textContent = '00:00';
    }

    // Rendiamo accessibili le funzioni all'HTML tramite l'oggetto window
    window.cancellaRotta = cancellaRotta;
    window.toggleNavigazione = toggleNavigazione;
})();