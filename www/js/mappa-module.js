(function () {
    // Inizializzazione mappa con preferCanvas attivato per stampe PDF perfette (allinea i tratteggi)
    const map = L.map('mappa-container', { 
        zoomControl: false,
        preferCanvas: true 
    }).setView([44.006, 12.657], 13);

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
    let wakeLock = null;

    const isNativo = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();

    // --- 1. PLOTTER MANUALE E PIANIFICAZIONE TATTICA ---
    map.on('click', function (e) {
        if (inNavigazione) return; 
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        arrayWaypoint.push([lat, lng]);

        L.circleMarker([lat, lng], { radius: 5, color: '#ef4444', fillOpacity: 1 }).addTo(map);
        aggiornaDisegnoRotta();
        
        // Apre il pannello di calcolo SOLO al momento in cui piazzi il secondo punto (Destinazione)
        if (arrayWaypoint.length === 2) {
            document.getElementById('sheet-pianificazione').classList.add('open');
        }
    });

    function aggiornaDisegnoRotta() {
        if (lineaRotta) map.removeLayer(lineaRotta);
        lineaRotta = L.polyline(arrayWaypoint, { color: '#f43d3d', weight: 3, dashArray: '5, 10' }).addTo(map);

        let totaleMetri = 0;
        if (arrayWaypoint.length > 1) {
            for (let i = 0; i < arrayWaypoint.length - 1; i += 1) {
                const puntoA = L.latLng(arrayWaypoint[i]);
                const puntoB = L.latLng(arrayWaypoint[i + 1]);
                totaleMetri += map.distance(puntoA, puntoB);
            }
        }
        
        const migliaNautiche = totaleMetri / 1852;
        document.getElementById('plan-distanza').textContent = migliaNautiche.toFixed(2) + " Nm";
        window.calcolaTempoStimato();
    }

    // Interruttore Dati Meteo: Base (Standard) <--> Reali (API)
    window.scaricaMeteoRotta = async function() {
        if (arrayWaypoint.length === 0) {
            alert("Traccia almeno il punto di partenza sulla mappa prima di gestire il meteo.");
            return;
        }

        const btn = document.getElementById('btn-meteo-rotta');
        
        // Se il bottone è in modalità "Torna ai Dati Standard"
        if (btn.getAttribute('data-stato') === 'reali') {
            document.getElementById('plan-vento-vel').value = '8';
            document.getElementById('plan-vento-dir').value = '45';
            document.getElementById('plan-corr-vel').value = '0.5';
            document.getElementById('plan-corr-dir').value = '90';
            
            btn.innerHTML = "📡 Dati Reali API";
            btn.style.background = "#3b82f6";
            btn.setAttribute('data-stato', 'base');
            
            window.calcolaTempoStimato();
            return;
        }

        // Se il bottone è in modalità "Scarica API Reali"
        btn.innerHTML = "⏳ Scan...";
        btn.style.background = "#f59e0b";

        const lat = arrayWaypoint[0][0];
        const lon = arrayWaypoint[0][1];

        try {
            const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&current=ocean_current_velocity,ocean_current_direction&timezone=auto`;
            const urlVento = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=kn&timezone=auto`;
            
            const [resMarine, resWind] = await Promise.all([fetch(url), fetch(urlVento)]);
            const dataMarine = await resMarine.json();
            const dataWind = await resWind.json();

            const corrVel = (dataMarine.current.ocean_current_velocity * 0.539957) || 0;
            const corrDir = dataMarine.current.ocean_current_direction || 0;
            const ventoVel = dataWind.current.wind_speed_10m || 0;
            const ventoDir = dataWind.current.wind_direction_10m || 0;

            document.getElementById('plan-corr-vel').value = corrVel.toFixed(1);
            document.getElementById('plan-corr-dir').value = Math.round(corrDir);
            document.getElementById('plan-vento-vel').value = Math.round(ventoVel);
            document.getElementById('plan-vento-dir').value = Math.round(ventoDir);

            // Cambia l'aspetto del bottone per offrire il ritorno ai dati standard
            btn.innerHTML = "⚓ Dati Standard";
            btn.style.background = "#10b981"; // Verde per indicare che stai usando i dati reali
            btn.setAttribute('data-stato', 'reali');

            window.calcolaTempoStimato(); 

        } catch (error) {
            console.error(error);
            alert("Impossibile scaricare i dati. Modalità offline attiva.");
            btn.innerHTML = "📡 Dati Reali API";
            btn.style.background = "#3b82f6";
            btn.setAttribute('data-stato', 'base');
        }
    };

    // Calcolatore Tattico Vettoriale Segmento per Segmento
    window.calcolaTempoStimato = function() {
        if (arrayWaypoint.length < 2) return;

        const vp = parseFloat(document.getElementById('plan-velocita').value) || 0.1;
        const vc = parseFloat(document.getElementById('plan-corr-vel').value) || 0;
        const dc = parseFloat(document.getElementById('plan-corr-dir').value) || 0;
        
        let tempoTotaleOre = 0;

        // Analizza ogni singolo tratto della rotta per calcolare la Velocità Effettiva esatta
        for (let i = 0; i < arrayWaypoint.length - 1; i++) {
            const p1 = L.latLng(arrayWaypoint[i]);
            const p2 = L.latLng(arrayWaypoint[i + 1]);
            
            const distanzaNm = map.distance(p1, p2) / 1852;
            
            // Calcola la Rotta Vera (Rv) del segmento in gradi
            const lat1 = p1.lat * Math.PI/180;
            const lat2 = p2.lat * Math.PI/180;
            const dLon = (p2.lng - p1.lng) * Math.PI/180;
            const y = Math.sin(dLon) * Math.cos(lat2);
            const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
            let rv = Math.atan2(y, x) * 180 / Math.PI;
            if (rv < 0) rv += 360;

            // Scomposizione vettoriale (Pitagora e Trigonometria per trovare la Veff)
            const radRv = rv * (Math.PI / 180);
            const radDc = dc * (Math.PI / 180);

            const vpx = vp * Math.sin(radRv);
            const vpy = vp * Math.cos(radRv);
            const vcx = vc * Math.sin(radDc);
            const vcy = vc * Math.cos(radDc);

            const veff_x = vpx + vcx;
            const veff_y = vpy + vcy;
            
            const veff = Math.sqrt(Math.pow(veff_x, 2) + Math.pow(veff_y, 2));

            // Aggiunge il tempo di questo specifico segmento al totale
            tempoTotaleOre += (distanzaNm / veff);
        }

        const ore = Math.floor(tempoTotaleOre);
        const minuti = Math.round((tempoTotaleOre - ore) * 60);
        
        document.getElementById('plan-tempo').innerText = `${ore}h ${minuti.toString().padStart(2, '0')}m`;
    };

    // --- GENERATORE PDF DEFINITIVO (Fix Schermo Bianco) ---
    window.scaricaPDFPianificato = function() {
        if (arrayWaypoint.length < 2) {
            alert("Traccia almeno due punti sulla mappa per creare un itinerario.");
            return;
        }

        const btnPdf = document.getElementById('btn-pdf-piano');
        btnPdf.innerHTML = "⏳ Renderizzazione in corso...";
        btnPdf.style.background = "#f59e0b";

        // 1. Spegni TUTTA l'interfaccia dell'app, forzando i blocchi del CSS (!important)
        const mainHeader = document.getElementById('main-header');
        if(mainHeader) mainHeader.style.setProperty('display', 'none', 'important');
        
        const menuPoseidon = document.getElementById('menu-Poseidon');
        if(menuPoseidon) menuPoseidon.style.setProperty('display', 'none', 'important');
        
        const fabContainer = document.querySelector('.fab-container');
        if(fabContainer) fabContainer.style.setProperty('display', 'none', 'important');
        
        const hudTop = document.querySelector('.hud-top');
        if(hudTop) hudTop.style.setProperty('display', 'none', 'important');
        
        document.getElementById('sheet-pianificazione').classList.remove('open');

        // Ripristina lo scroll al vertice per non confondere il fotografo PDF
        window.scrollTo(0, 0);

        // 2. Piazza Marker con etichette calibrate
        const pPartenza = arrayWaypoint[0];
        const pArrivo = arrayWaypoint[arrayWaypoint.length - 1];

        const markerP = L.circleMarker(pPartenza, { radius: 8, color: '#22c55e', fillOpacity: 1 }).addTo(map)
            .bindTooltip("PARTENZA", {permanent: true, direction: "top", offset: [0, -10]}).openTooltip();
        
        const markerA = L.circleMarker(pArrivo, { radius: 8, color: '#ef4444', fillOpacity: 1 }).addTo(map) 
            .bindTooltip("ARRIVO", {permanent: true, direction: "top", offset: [0, -10]}).openTooltip();

        // 3. Inietta il Cruscotto Dati come elemento nativo di Leaflet
        const PrintHeader = L.Control.extend({
            options: { position: 'topleft' },
            onAdd: function () {
                const div = L.DomUtil.create('div');
                div.style.backgroundColor = 'rgba(15, 23, 42, 0.9)';
                div.style.color = 'white';
                div.style.padding = '15px 25px';
                div.style.borderRadius = '8px';
                div.style.border = '2px solid #38bdf8';
                div.style.fontFamily = 'Inter, sans-serif';

                const dist = document.getElementById('plan-distanza').innerText;
                const vel = document.getElementById('plan-velocita').value + " Kn";
                const eta = document.getElementById('plan-tempo').innerText;

                div.innerHTML = `
                    <h2 style="margin: 0 0 10px 0; color: #38bdf8; font-size: 1.3rem; text-transform: uppercase;">Piano Navigazione</h2>
                    <div style="font-size: 1.1rem; line-height: 1.6;">
                        <div><b style="color: #94a3b8;">Distanza:</b> ${dist}</div>
                        <div><b style="color: #94a3b8;">Velocità:</b> ${vel}</div>
                        <div><b style="color: #94a3b8;">ETA:</b> ${eta}</div>
                    </div>
                `;
                return div;
            }
        });
        const headerControl = new PrintHeader().addTo(map);

        // 4. Centra la mappa con un margine sicuro per inquadrare tutto
        const bounds = L.latLngBounds(arrayWaypoint);
        map.fitBounds(bounds, { padding: [50, 50] });

        // 5. Attendi 2.5 secondi (Tempo necessario al browser per caricare i blocchi grigi della mappa)
        setTimeout(() => {
            const foglio = document.body; // Usa il BODY per evitare l'errore del PDF Bianco
            
            const opt = {
                margin:       0,
                filename:     `Rotta_Pianificata_${Date.now()}.pdf`,
                image:        { type: 'jpeg', quality: 1 },
                html2canvas:  { scale: 2, useCORS: true, logging: false },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
            };

            html2pdf().set(opt).from(foglio).save().then(() => {
                // 6. Ripristina l'App allo stato originale
                map.removeControl(headerControl);
                map.removeLayer(markerP);
                map.removeLayer(markerA);
                
                if(mainHeader) mainHeader.style.removeProperty('display');
                if(menuPoseidon) menuPoseidon.style.removeProperty('display');
                if(fabContainer) fabContainer.style.removeProperty('display');
                if(hudTop) hudTop.style.removeProperty('display');
                
                document.getElementById('sheet-pianificazione').classList.add('open');
                
                btnPdf.innerHTML = "📥 Genera PDF Rotta";
                btnPdf.style.background = "#3b82f6";
            });
        }, 2500); 
    };

    const vecchiaCancellaRotta = window.cancellaRotta;
    window.cancellaRotta = function(silenzioso = false) {
        if (inNavigazione && !silenzioso) {
            alert("Sospendi la Navigazione prima di ripulire la mappa.");
            return;
        }

        map.eachLayer((layer) => {
            if (layer instanceof L.Polyline || layer instanceof L.CircleMarker) layer.remove();
        });

        arrayWaypoint = [];
        lineaRotta = null;
        liveRotta = L.polyline([], {color: '#22c55e', weight: 4}).addTo(map);

        document.getElementById('distanza-totale').textContent = '0.00';
        const vAtt = document.getElementById('velocita-attuale');
        if (vAtt) vAtt.textContent = '0.0';
        const tTras = document.getElementById('tempo-trascorso');
        if (tTras) tTras.textContent = '00:00';

        document.getElementById('sheet-pianificazione').classList.remove('open');
        document.getElementById('plan-distanza').textContent = "0.00 Nm";
        document.getElementById('plan-tempo').textContent = "00h 00m";

        // Ripristina l'interruttore Meteo allo stato base
        const btnMeteo = document.getElementById('btn-meteo-rotta');
        if (btnMeteo) {
            btnMeteo.innerHTML = "📡 Dati Reali API";
            btnMeteo.style.background = "#3b82f6";
            btnMeteo.setAttribute('data-stato', 'base');
            
            // Rimette anche i valori nei campi input per coerenza visiva
            document.getElementById('plan-vento-vel').value = '8';
            document.getElementById('plan-vento-dir').value = '45';
            document.getElementById('plan-corr-vel').value = '0.5';
            document.getElementById('plan-corr-dir').value = '90';
        }
    };

    window.centraMappa = function() {
        if (ultimoPuntoRilevato) {
            map.setView(ultimoPuntoRilevato, 16);
        } else if (arrayWaypoint.length > 0) {
            map.setView(arrayWaypoint[arrayWaypoint.length - 1], 15);
        }
    };

    // --- 2. TRACCIAMENTO SATELLITARE GPS (Live) ---
    window.avviaGPS = function() {
        inNavigazione = true;
        gpsTrack = [];
        puntiTracciato = []; 
        liveDistanzaNm = 0;
        liveRotta.setLatLngs([]);
        window.cancellaRotta(true); 

        mantieniSchermoAcceso(); 

        startTime = Date.now();
        timerInterval = setInterval(aggiornaTimer, 1000);

        const allarmeGPS = (errore) => {
            console.warn("Errore Sensore:", errore);
            alert("⚠️ ATTENZIONE: Segnale satellitare assente o permessi negati. Assicurati che la Posizione (GPS) sia attiva sul tuo dispositivo per poter tracciare la rotta.");
            window.fermaGPS();
            if (window.resetUINavigazione) window.resetUINavigazione(); 
        };

        if (isNativo) {
            window.Capacitor.Plugins.BackgroundGeolocation.addWatcher({
                backgroundTitle: "Poseidon Navigazione",
                backgroundMessage: "Registrazione rotta in corso.",
                requestPermissions: true, 
                stale: false,
                distanceFilter: 2 
            }, function(location, error) {
                if (error) {
                    allarmeGPS(error);
                    return;
                }
                elaboraCoordinate(location.latitude, location.longitude, location.speed);
            }).then(id => { bgWatcherId = id; });
        } else {
            if (navigator.geolocation) {
                watchId = navigator.geolocation.watchPosition(
                    (pos) => elaboraCoordinate(pos.coords.latitude, pos.coords.longitude, pos.coords.speed),
                    (err) => {
                        if (err.code === 1 || err.code === 2) allarmeGPS(err);
                    },
                    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
                );
            } else {
                alert("Sensore GPS non supportato dal dispositivo.");
                window.fermaGPS();
                if (window.resetUINavigazione) window.resetUINavigazione();
            }
        }
    };

    window.fermaGPS = function() {
        inNavigazione = false;
        clearInterval(timerInterval);

        rilasciaSchermo(); 

        if (isNativo && bgWatcherId) {
            window.Capacitor.Plugins.BackgroundGeolocation.removeWatcher({ id: bgWatcherId });
            bgWatcherId = null;
        } else if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
        }
    };

    function elaboraCoordinate(lat, lng, speedMs) {
        const speedKnots = (speedMs || 0) * 1.94384; 
        const time = new Date().toISOString();
        ultimoPuntoRilevato = L.latLng(lat, lng); 

        if (gpsTrack.length > 0) {
            const ultimoPunto = gpsTrack[gpsTrack.length - 1];
            liveDistanzaNm += (ultimoPunto.distanceTo(ultimoPuntoRilevato) / 1852);
        }

        gpsTrack.push(ultimoPuntoRilevato);
        liveRotta.addLatLng(ultimoPuntoRilevato);
        map.panTo(ultimoPuntoRilevato); 

        puntiTracciato.push({ lat: lat, lon: lng, vel: speedKnots, time: time });

        document.getElementById("distanza-totale").innerText = liveDistanzaNm.toFixed(2);
        const nodoVelocita = document.getElementById("velocita-attuale");
        if (nodoVelocita) nodoVelocita.innerText = speedKnots.toFixed(1);
    }

    function aggiornaTimer() {
        const diff = Math.floor((Date.now() - startTime) / 1000);
        const m = Math.floor(diff / 60).toString().padStart(2, '0');
        const s = (diff % 60).toString().padStart(2, '0');
        document.getElementById("tempo-trascorso").innerText = `${m}:${s}`;
    }

    // --- 3. WAKE LOCK (Scudo Antisospensione) ---
    async function mantieniSchermoAcceso() {
        if ('wakeLock' in navigator) {
            try {
                wakeLock = await navigator.wakeLock.request('screen');
                console.log('Schermo bloccato: navigazione continua assicurata.');
                
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

    // --- 4. SALVATAGGIO STORICO GPS REALE ---
    window.salvaRotta = function() {
        if (puntiTracciato.length < 2) {
            alert("Rotta troppo breve per essere salvata.");
            window.cancellaRotta();
            return; 
        }

        const oggi = new Date();
        const dataFormattata = oggi.toLocaleDateString('it-IT') + " " + oggi.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'});

        const nuovaRotta = {
            id: Date.now(),
            nome: "Rotta del " + dataFormattata,
            data: dataFormattata,
            punti: puntiTracciato 
        };

        const rotteEsistenti = JSON.parse(localStorage.getItem("navigazione_rotte") || "[]");
        rotteEsistenti.push(nuovaRotta);
        localStorage.setItem("navigazione_rotte", JSON.stringify(rotteEsistenti));
        
        window.cancellaRotta();
    };
})();