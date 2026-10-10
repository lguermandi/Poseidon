(function () {
    // Inizializzazione mappa con preferCanvas attivato per stampe PDF perfette (allinea i tratteggi)
    const map = L.map('mappa-container', {
        zoomControl: false,
        preferCanvas: true
    }).setView([44.006, 12.657], 13);
    setTimeout(() => { map.invalidateSize(); }, 200);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
    L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);

    let arrayWaypoint = [];
    let lineaRotta = null;

    let inNavigazione = false;
    let bgWatcherId = null;
    let bgWatcherPromise = null;
    let trackingSessionId = 0;
    let watchId = null;
    let startTime = null;
    let timerInterval = null;
    let gpsTrack = [];
    let puntiTracciato = [];
    let liveRotta = L.polyline([], { color: '#22c55e', weight: 4 }).addTo(map);
    let liveDistanzaNm = 0;
    let ultimoPuntoRilevato = null;
    let wakeLock = null;

    const isNativo = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();

    async function richiediPermessiTracking() {
        if (!isNativo) return;

        try {
            const notifiche = window.Capacitor?.Plugins?.LocalNotifications;
            if (notifiche) {
                const statoNotifiche = await notifiche.checkPermissions();
                if (statoNotifiche.display !== 'granted') {
                    await notifiche.requestPermissions();
                }
            }
        } catch (errore) {
            console.warn('Permesso notifiche non disponibile:', errore);
        }
    }

    function leggiTracciaAttiva(stati = ['in_corso']) {
        try {
            const traccia = JSON.parse(localStorage.getItem('navigazione_traccia_attiva') || 'null');
            return traccia && stati.includes(traccia.stato) && Array.isArray(traccia.punti) ? traccia : null;
        } catch (errore) {
            console.warn('Traccia attiva non leggibile.', errore);
            return null;
        }
    }

    function impostaStatoTraccia(stato) {
        const traccia = leggiTracciaAttiva(['in_corso', 'in_pausa']);
        if (traccia) localStorage.setItem('navigazione_traccia_attiva', JSON.stringify({ ...traccia, stato }));
    }

    function chiudiTraccia() {
        localStorage.removeItem('navigazione_traccia_attiva');
        puntiTracciato = [];
        gpsTrack = [];
        liveDistanzaNm = 0;
        ultimoPuntoRilevato = null;
        liveRotta.setLatLngs([]);
        window.cancellaRotta(true);
    }

    function fermaPerErrore(messaggio) {
        window.fermaGPS();
        if (window.resetUINavigazione) window.resetUINavigazione();
        if (puntiTracciato.length > 0) document.getElementById('sheet-salvataggio')?.classList.add('open');
        alert(messaggio);
    }

    function ripristinaTracciaInPausa(traccia) {
        if (traccia.punti.length === 0) {
            localStorage.removeItem('navigazione_traccia_attiva');
            return;
        }
        puntiTracciato = traccia.punti;
        gpsTrack = traccia.punti.map(punto => L.latLng(punto.lat, punto.lon));
        liveDistanzaNm = Number(traccia.distanza) || 0;
        ultimoPuntoRilevato = gpsTrack[gpsTrack.length - 1];
        liveRotta.setLatLngs(gpsTrack);
        map.setView(ultimoPuntoRilevato, 16);
        document.getElementById('distanza-totale').textContent = liveDistanzaNm.toFixed(2);
        const secondi = Math.max(0, Math.floor((Date.parse(traccia.aggiornataUTC || traccia.iniziataUTC) - Date.parse(traccia.iniziataUTC)) / 1000));
        document.getElementById('tempo-trascorso').textContent = `${String(Math.floor(secondi / 60)).padStart(2, '0')}:${String(secondi % 60).padStart(2, '0')}`;
        impostaStatoTraccia('in_pausa');
        document.getElementById('sheet-salvataggio')?.classList.add('open');
    }

    window.scartaTraccia = chiudiTraccia;
    window.tracciaHaPunti = () => puntiTracciato.length > 0;

    function proprietarioCorrente() {
        try {
            const sessione = localStorage.getItem('poseidon_sessione') || sessionStorage.getItem('poseidon_sessione');
            return JSON.parse(sessione || 'null')?.email || 'utente-locale';
        } catch {
            return 'utente-locale';
        }
    }

    function accodaSincronizzazione(payload) {
        let coda;
        try {
            coda = JSON.parse(localStorage.getItem('poseidon_sync_queue') || '[]');
            if (!Array.isArray(coda)) coda = [];
        } catch {
            coda = [];
        }
        coda.push({ ...payload, accodataUTC: new Date().toISOString() });
        localStorage.setItem('poseidon_sync_queue', JSON.stringify(coda));
    }

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
    window.scaricaMeteoRotta = async function () {
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
    window.calcolaTempoStimato = function () {
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
            const lat1 = p1.lat * Math.PI / 180;
            const lat2 = p2.lat * Math.PI / 180;
            const dLon = (p2.lng - p1.lng) * Math.PI / 180;
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

            if (veff <= 0) {
                document.getElementById('plan-tempo').innerText = 'N/D';
                return;
            }

            // Aggiunge il tempo di questo specifico segmento al totale
            tempoTotaleOre += (distanzaNm / veff);
        }

        const ore = Math.floor(tempoTotaleOre);
        const minuti = Math.round((tempoTotaleOre - ore) * 60);

        document.getElementById('plan-tempo').innerText = `${ore}h ${minuti.toString().padStart(2, '0')}m`;
    };

    // --- GENERATORE PDF DEFINITIVO (Fix Schermo Bianco) ---
    window.scaricaPDFPianificato = function () {
        if (arrayWaypoint.length < 2) {
            alert("Traccia almeno due punti sulla mappa per creare un itinerario.");
            return;
        }

        const btnPdf = document.getElementById('btn-pdf-piano');
        btnPdf.innerHTML = "⏳ Renderizzazione in corso...";
        btnPdf.style.background = "#f59e0b";

        // 1. Spegni TUTTA l'interfaccia dell'app, forzando i blocchi del CSS (!important)
        const mainHeader = document.getElementById('main-header');
        if (mainHeader) mainHeader.style.setProperty('display', 'none', 'important');

        const menuPoseidon = document.getElementById('menu-Poseidon');
        if (menuPoseidon) menuPoseidon.style.setProperty('display', 'none', 'important');

        const fabContainer = document.querySelector('.fab-container');
        if (fabContainer) fabContainer.style.setProperty('display', 'none', 'important');

        const hudTop = document.querySelector('.hud-top');
        if (hudTop) hudTop.style.setProperty('display', 'none', 'important');

        document.getElementById('sheet-pianificazione').classList.remove('open');

        // Ripristina lo scroll al vertice per non confondere il fotografo PDF
        window.scrollTo(0, 0);

        // 2. Piazza Marker con etichette calibrate
        const pPartenza = arrayWaypoint[0];
        const pArrivo = arrayWaypoint[arrayWaypoint.length - 1];

        const markerP = L.circleMarker(pPartenza, { radius: 8, color: '#22c55e', fillOpacity: 1 }).addTo(map)
            .bindTooltip("PARTENZA", { permanent: true, direction: "top", offset: [0, -10] }).openTooltip();

        const markerA = L.circleMarker(pArrivo, { radius: 8, color: '#ef4444', fillOpacity: 1 }).addTo(map)
            .bindTooltip("ARRIVO", { permanent: true, direction: "top", offset: [0, -10] }).openTooltip();

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
                margin: 0,
                filename: `Rotta_Pianificata_${Date.now()}.pdf`,
                image: { type: 'jpeg', quality: 1 },
                html2canvas: { scale: 2, useCORS: true, logging: false },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
            };

            Promise.resolve()
                .then(() => html2pdf().set(opt).from(foglio).save())
                .catch((errore) => {
                    console.error('Generazione PDF non riuscita:', errore);
                    alert('Impossibile generare il PDF. Riprova.');
                })
                .finally(() => {
                    // 6. Ripristina l'App allo stato originale
                    map.removeControl(headerControl);
                    map.removeLayer(markerP);
                    map.removeLayer(markerA);

                    if (mainHeader) mainHeader.style.removeProperty('display');
                    if (menuPoseidon) menuPoseidon.style.removeProperty('display');
                    if (fabContainer) fabContainer.style.removeProperty('display');
                    if (hudTop) hudTop.style.removeProperty('display');

                    document.getElementById('sheet-pianificazione').classList.add('open');

                    btnPdf.innerHTML = "📥 Genera PDF";
                    btnPdf.style.background = "#3b82f6";
                });
        }, 2500);
    };

    const vecchiaCancellaRotta = window.cancellaRotta;
    window.cancellaRotta = function (silenzioso = false) {
        if (inNavigazione && !silenzioso) {
            alert("Sospendi la Navigazione prima di ripulire la mappa.");
            return;
        }

        map.eachLayer((layer) => {
            if (layer instanceof L.Polyline || layer instanceof L.CircleMarker) layer.remove();
        });

        arrayWaypoint = [];
        lineaRotta = null;
        liveRotta = L.polyline([], { color: '#22c55e', weight: 4 }).addTo(map);

        document.getElementById('distanza-totale').textContent = '0.00';
        const vAtt = document.getElementById('velocita-attuale');
        if (vAtt) vAtt.textContent = '0.0';
        const tTras = document.getElementById('tempo-trascorso');
        if (tTras) tTras.textContent = '00:00';

        document.getElementById('sheet-pianificazione')?.classList.remove('open');
        const planDistanza = document.getElementById('plan-distanza');
        const planTempo = document.getElementById('plan-tempo');
        if (planDistanza) planDistanza.textContent = "0.00 Nm";
        if (planTempo) planTempo.textContent = "00h 00m";

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

    window.centraMappa = function () {
        if (ultimoPuntoRilevato) {
            map.setView(ultimoPuntoRilevato, 16);
        } else if (arrayWaypoint.length > 0) {
            map.setView(arrayWaypoint[arrayWaypoint.length - 1], 15);
        }
    };

    // --- 2. TRACCIAMENTO SATELLITARE GPS (Live) ---
    window.avviaGPS = async function (riprendi = false) {
        if (inNavigazione) {
            return;
        }
        if (!riprendi && leggiTracciaAttiva(['in_pausa', 'in_corso'])) {
            throw new Error('salva o scarta prima la navigazione in pausa.');
        }

        inNavigazione = true;
        const sessionId = ++trackingSessionId;
        const tracciaSalvata = riprendi ? leggiTracciaAttiva() : null;
        gpsTrack = tracciaSalvata?.punti.map(punto => L.latLng(punto.lat, punto.lon)) || [];
        puntiTracciato = tracciaSalvata?.punti || [];
        liveDistanzaNm = Number(tracciaSalvata?.distanza) || 0;
        liveRotta.setLatLngs([]);
        window.cancellaRotta(true);

        if (gpsTrack.length > 0) {
            liveRotta.setLatLngs(gpsTrack);
            ultimoPuntoRilevato = gpsTrack[gpsTrack.length - 1];
            map.setView(ultimoPuntoRilevato, 16);
        }
        document.getElementById('distanza-totale').textContent = liveDistanzaNm.toFixed(2);

        mantieniSchermoAcceso();

        // --- FIX TIMER INFINITO ---
        const oraAttuale = Date.now();
        const tempoInizioSalvato = tracciaSalvata?.iniziataUTC ? Date.parse(tracciaSalvata.iniziataUTC) : oraAttuale;

        // Se la traccia è più vecchia di 1 ora e NON stiamo premendo "riprendi", resetta il timer a ora
        if (!riprendi && (oraAttuale - tempoInizioSalvato > 3600000)) {
            startTime = oraAttuale;
        } else {
            startTime = tempoInizioSalvato;
        }
        // ---------------------------

        timerInterval = setInterval(aggiornaTimer, 1000);
        aggiornaTimer();

        if (!tracciaSalvata) {
            localStorage.setItem('navigazione_traccia_attiva', JSON.stringify({
                iniziataUTC: new Date(startTime).toISOString(),
                proprietario: proprietarioCorrente(),
                imbarcazione: localStorage.getItem('profilo_barca') || 'Non specificata',
                punti: [],
                distanza: 0,
                stato: 'in_corso'
            }));
        }

        await richiediPermessiTracking();

        const allarmeGPS = (errore) => {
            const codiceErrore = `${errore?.code || ''} ${errore?.message || ''}`;
            const permessoNegato = errore?.code === 1 || /NOT_AUTHORIZED|permission denied|permesso negato/i.test(codiceErrore);
            console.warn(permessoNegato ? 'Permesso GPS negato:' : 'GPS temporaneamente non disponibile:', errore);
            if (!permessoNegato) return;

            fermaPerErrore('Permesso o servizio di posizione non disponibile. Verifica le impostazioni GPS e riprova.');
        };

        if (isNativo) {
            const backgroundGeolocation = window.Capacitor?.Plugins?.BackgroundGeolocation;
            if (!backgroundGeolocation?.addWatcher) {
                throw new Error('Plugin BackgroundGeolocation non registrato nell’app.');
            }

            const opzioniWatcher = {
                backgroundTitle: "Poseidon Navigazione",
                backgroundMessage: "Registrazione rotta in corso.",
                requestPermissions: true,
                stale: false,
                distanceFilter: 2
            };
            const callbackWatcher = function (location, error) {
                if (!inNavigazione) return;
                if (error) {
                    allarmeGPS(error);
                    return;
                }
                elaboraCoordinate(location.latitude, location.longitude, location.speed, location.time);
            };

            const aggiungiWatcher = async (tentativo = 0) => {
                try {
                    return await backgroundGeolocation.addWatcher(opzioniWatcher, callbackWatcher);
                } catch (errore) {
                    const servizioInAvvio = /service not running/i.test(errore?.message || '');
                    if (servizioInAvvio && tentativo < 4 && inNavigazione && sessionId === trackingSessionId) {
                        await new Promise(resolve => setTimeout(resolve, 400));
                        return aggiungiWatcher(tentativo + 1);
                    }
                    throw errore;
                }
            };

            bgWatcherPromise = aggiungiWatcher().then(async id => {
                if (!inNavigazione || sessionId !== trackingSessionId) {
                    await backgroundGeolocation.removeWatcher({ id });
                    return null;
                }
                bgWatcherId = id;
                return id;
            }).catch((errore) => {
                if (!inNavigazione || sessionId !== trackingSessionId) return null;
                if (errore?.code === 'NOT_AUTHORIZED' || errore?.code === 1 || /permission denied/i.test(errore?.message || '')) {
                    allarmeGPS(errore);
                } else {
                    console.error('Impossibile avviare il watcher GPS:', errore);
                    fermaPerErrore(`GPS non avviato: ${errore?.message || 'errore del servizio di localizzazione'}`);
                }
                return null;
            }).finally(() => {
                bgWatcherPromise = null;
            });
            await bgWatcherPromise;
        } else {
            if (navigator.geolocation) {
                watchId = navigator.geolocation.watchPosition(
                    (posizione) => {
                        if (!inNavigazione) return;
                        if (posizione.coords.accuracy > 60) {
                            console.warn('GPS impreciso scartato:', posizione.coords.accuracy, 'metri');
                            return;
                        }
                        elaboraCoordinate(posizione.coords.latitude, posizione.coords.longitude, posizione.coords.speed, posizione.timestamp);
                    },
                    (errore) => allarmeGPS(errore),
                    { enableHighAccuracy: true, maximumAge: 2000, timeout: 60000 }
                );
            } else {
                allarmeGPS(new Error("Sensore GPS non supportato dal dispositivo."));
            }
        }
    };

    function riprendiTracciaSeNecessario() {
        const traccia = leggiTracciaAttiva(['in_corso', 'in_pausa']);
        if (!traccia) return;

        if (traccia.stato === 'in_pausa' || !isNativo) {
            ripristinaTracciaInPausa(traccia);
            return;
        }

        setTimeout(() => {
            window.avviaGPS(true).then(() => {
                if (inNavigazione && window.impostaUINavigazione) window.impostaUINavigazione(true);
            }).catch((errore) => {
                console.error('Impossibile riprendere il tracking:', errore);
                window.fermaGPS();
                if (window.resetUINavigazione) window.resetUINavigazione();
            });
        }, 250);
    }

    riprendiTracciaSeNecessario();

    window.fermaGPS = function () {
        const eraAttivo = inNavigazione;
        inNavigazione = false;
        trackingSessionId += 1;
        clearInterval(timerInterval);
        timerInterval = null;

        rilasciaSchermo();

        if (eraAttivo) {
            if (puntiTracciato.length === 0) localStorage.removeItem('navigazione_traccia_attiva');
            else impostaStatoTraccia('in_pausa');
        }

        if (isNativo && bgWatcherId) {
            window.Capacitor.Plugins.BackgroundGeolocation.removeWatcher({ id: bgWatcherId }).catch(() => { });
            bgWatcherId = null;
        } else if (isNativo && bgWatcherPromise) {
            // Se i permessi sono ancora in corso, il completamento dello start
            // vedra inNavigazione=false e rimuovera subito il watcher.
            bgWatcherPromise.catch(() => { });
        } else if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }
    };

    function elaboraCoordinate(lat, lng, speedMs, timestamp) {
        const adesso = timestamp ? timestamp : Date.now();
        const nuovoPunto = L.latLng(lat, lng);

        let velocitaCalcolata = 0;

        // Calcoliamo la distanza solo se abbiamo già almeno un punto precedente
        if (gpsTrack.length > 0) {
            const ultimoPunto = gpsTrack[gpsTrack.length - 1];
            const distanzaMetri = ultimoPunto.distanceTo(nuovoPunto);

            // Filtro Rumore: ignora spostamenti inferiori a 2 metri (jitter del GPS)
            if (distanzaMetri > 2) {
                const distanzaNm = distanzaMetri / 1852;
                liveDistanzaNm += distanzaNm;

                // Calcolo manuale velocità se speedMs è null o instabile
                // Aggiunto controllo di sicurezza: puntiTracciato deve avere elementi
                if ((speedMs === null || speedMs === undefined || speedMs === 0) && puntiTracciato.length > 0) {
                    const tempoSecondi = (adesso - new Date(puntiTracciato[puntiTracciato.length - 1].time).getTime()) / 1000;
                    if (tempoSecondi > 0) {
                        velocitaCalcolata = (distanzaMetri / tempoSecondi) * 1.94384; // da m/s a nodi
                    }
                } else {
                    velocitaCalcolata = (speedMs || 0) * 1.94384;
                }
            } else {
                velocitaCalcolata = 0; // Siamo praticamente fermi
            }
        }

        // Aggiorna variabili globali e UI
        ultimoPuntoRilevato = nuovoPunto;
        gpsTrack.push(nuovoPunto);
        liveRotta.addLatLng(nuovoPunto);
        map.panTo(nuovoPunto, { animate: false });

        const timeISO = new Date(adesso).toISOString();
        puntiTracciato.push({ lat: lat, lon: lng, vel: velocitaCalcolata, time: timeISO });

        // Salvataggio persistente per ripresa in caso di crash
        localStorage.setItem('navigazione_traccia_attiva', JSON.stringify({
            iniziataUTC: puntiTracciato[0].time,
            aggiornataUTC: timeISO,
            proprietario: proprietarioCorrente(),
            imbarcazione: localStorage.getItem('profilo_barca') || 'Non specificata',
            punti: puntiTracciato,
            distanza: liveDistanzaNm,
            stato: 'in_corso'
        }));

        // Aggiornamento display
        requestAnimationFrame(() => {
            const distEl = document.getElementById("distanza-totale");
            const velEl = document.getElementById("velocita-attuale");
            if (distEl) distEl.innerText = liveDistanzaNm.toFixed(2);
            if (velEl) velEl.innerText = velocitaCalcolata.toFixed(1);
        });
    }

    function aggiornaTimer() {
        const diff = Math.floor((Date.now() - startTime) / 1000);
        const m = Math.floor(diff / 60).toString().padStart(2, '0');
        const s = (diff % 60).toString().padStart(2, '0');
        document.getElementById("tempo-trascorso").innerText = `${m}:${s}`;
    }

    // --- 3. WAKE LOCK (Scudo Antisospensione) ---
    async function mantieniSchermoAcceso() {
        if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
        if (wakeLock && !wakeLock.released) return;
        try {
            wakeLock = await navigator.wakeLock.request('screen');
        } catch (errore) {
            console.warn('Wake Lock non disponibile:', errore);
        }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        setTimeout(() => {
            map.invalidateSize();
            if (inNavigazione) {
                if (ultimoPuntoRilevato) map.panTo(ultimoPuntoRilevato, { animate: false });
                mantieniSchermoAcceso();
            }
        }, 200);
    });

    function rilasciaSchermo() {
        if (wakeLock !== null) {
            wakeLock.release().then(() => {
                wakeLock = null;
            });
        }
    }

    // --- 4. SALVATAGGIO STORICO GPS REALE ---
    window.salvaRotta = function () {
        if (inNavigazione) return;
        if (puntiTracciato.length < 2) {
            alert("Rotta troppo breve per essere salvata.");
            chiudiTraccia();
            return;
        }

        const oggi = new Date();
        const dataFormattata = oggi.toLocaleDateString('it-IT') + " " + oggi.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        const sessione = (() => {
            try {
                const valore = localStorage.getItem('poseidon_sessione') || sessionStorage.getItem('poseidon_sessione');
                return JSON.parse(valore || 'null');
            } catch {
                return null;
            }
        })();

        const nuovaRotta = {
            id: Date.now(),
            nome: "Rotta del " + dataFormattata,
            data: dataFormattata,
            dataInizioUTC: puntiTracciato[0]?.time || oggi.toISOString(),
            dataFineUTC: puntiTracciato[puntiTracciato.length - 1]?.time || oggi.toISOString(),
            proprietario: sessione?.email || 'utente-locale',
            imbarcazione: localStorage.getItem('profilo_barca') || 'Non specificata',
            punti: puntiTracciato,
            distanza: liveDistanzaNm,
            durata: document.getElementById("tempo-trascorso").innerText
        };

        let rotteEsistenti;
        try {
            rotteEsistenti = JSON.parse(localStorage.getItem("navigazione_rotte") || "[]");
            if (!Array.isArray(rotteEsistenti)) rotteEsistenti = [];
        } catch {
            rotteEsistenti = [];
        }
        rotteEsistenti.push(nuovaRotta);
        localStorage.setItem("navigazione_rotte", JSON.stringify(rotteEsistenti));
        localStorage.removeItem('navigazione_traccia_attiva');

        if (sessione?.token && sessione.email) {
            const payloadCloud = {
                azione: 'salva_dati',
                email: sessione.email,
                sessionToken: sessione.token,
                tipoDato: 'registro_sicurezza_rotta',
                contenuto: nuovaRotta
            };
            fetch('https://script.google.com/macros/s/AKfycbz66PaHt0R7KJclqVBHGVOSGHrTBBHRGl5HKl7AarzPBa9ZcmJCYqKrHxpoSacrJBw/exec', {
                method: 'POST',
                body: JSON.stringify(payloadCloud)
            }).then((risposta) => {
                if (!risposta.ok) throw new Error(`HTTP ${risposta.status}`);
            }).catch(() => {
                accodaSincronizzazione(payloadCloud);
                console.warn('Sincronizzazione registro sicurezza rinviata.');
            });
        }

        chiudiTraccia();
    };

    window.esportaGPX = function () {
        if (puntiTracciato.length < 2) {
            alert('Registra almeno due punti prima di esportare la traccia.');
            return;
        }

        const coordinate = puntiTracciato.map(punto => `\n      <trkpt lat="${Number(punto.lat).toFixed(6)}" lon="${Number(punto.lon).toFixed(6)}"><time>${punto.time}</time><extensions><speed>${Number(punto.vel || 0).toFixed(2)}</speed></extensions></trkpt>`).join('');
        const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Poseidon" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Rotta Poseidon</name><trkseg>${coordinate}\n    </trkseg></trk></gpx>`;
        const blob = new Blob([gpx], { type: 'application/gpx+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `rotta-poseidon-${new Date().toISOString().slice(0, 10)}.gpx`;
        link.click();
        URL.revokeObjectURL(url);
    };
})();

