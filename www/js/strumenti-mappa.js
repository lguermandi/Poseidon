(function (root) {
    function rilevamento(partenza, arrivo) {
        const rad = Math.PI / 180;
        const lat1 = partenza.lat * rad;
        const lat2 = arrivo.lat * rad;
        const dLon = (arrivo.lng - partenza.lng) * rad;
        const y = Math.sin(dLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        return (Math.atan2(y, x) / rad + 360) % 360;
    }

    function creaStrumentiMappa(map) {
        const risultato = document.getElementById('risultato-strumenti');
        const misura = document.getElementById('strumento-misura');
        const meteo = document.getElementById('strumento-meteo');
        const statoFondali = document.getElementById('stato-fondali');
        const statoPorti = document.getElementById('stato-porti');
        const disegni = L.featureGroup().addTo(map);
        const porti = L.featureGroup().addTo(map);
        const fondali = L.tileLayer.wms('https://ows.emodnet-bathymetry.eu/wms', {
            layers: 'emodnet:contours',
            format: 'image/png',
            transparent: true,
            opacity: 0.8,
            attribution: '<a href="https://emodnet.ec.europa.eu/">EMODnet Bathymetry</a>'
        });
        let modo = null;
        let partenza = null;
        let richiestaMeteo = 0;
        let richiestaPorti = 0;
        let erroreFondali = false;

        function impostaModo(nuovo, alterna = true) {
            modo = alterna && modo === nuovo ? null : nuovo;
            partenza = null;
            richiestaMeteo += 1;
            disegni.clearLayers();
            misura.setAttribute('aria-pressed', String(modo === 'misura'));
            meteo.setAttribute('aria-pressed', String(modo === 'meteo'));
            risultato.hidden = !modo;
            if (modo) document.getElementById('pannello-strumenti').open = false;
            risultato.textContent = modo === 'misura'
                ? 'Tocca due punti sulla mappa. Distanza e rilevamento sono indicativi.'
                : modo === 'meteo'
                    ? 'Tocca un punto per richiedere le previsioni Open-Meteo.'
                    : 'Seleziona uno strumento e tocca la mappa.';
        }

        misura.addEventListener('click', () => impostaModo('misura'));
        meteo.addEventListener('click', () => impostaModo('meteo'));

        document.getElementById('mostra-fondali').addEventListener('change', evento => {
            if (evento.target.checked) {
                statoFondali.textContent = 'Caricamento batimetria EMODnet; dati indicativi, copertura limitata.';
                fondali.addTo(map);
            } else {
                map.removeLayer(fondali);
                statoFondali.textContent = 'Fondali indicativi, copertura limitata; non per la navigazione.';
            }
        });
        fondali.on('loading', () => { erroreFondali = false; });
        fondali.on('load', () => {
            if (!erroreFondali) statoFondali.textContent = 'Batimetria EMODnet: dati indicativi, copertura limitata; non per la navigazione.';
        });
        fondali.on('tileerror', () => {
            erroreFondali = true;
            statoFondali.textContent = 'Alcuni fondali non sono disponibili. Verifica la connessione.';
        });

        async function json(url) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 25000);
            try {
                const risposta = await fetch(url, { signal: controller.signal });
                if (!risposta.ok) throw new Error(`HTTP ${risposta.status}`);
                return await risposta.json();
            } finally {
                clearTimeout(timeout);
            }
        }

        function valore(numero, unita, decimali = 1) {
            return Number.isFinite(numero) ? `${numero.toFixed(decimali)} ${unita}` : 'N/D';
        }

        async function caricaMeteo(punto) {
            const id = ++richiestaMeteo;
            const coordinate = `latitude=${punto.lat.toFixed(5)}&longitude=${punto.lng.toFixed(5)}`;
            risultato.textContent = 'Caricamento previsioni…';
            try {
                const [vento, mare] = await Promise.all([
                    json(`https://api.open-meteo.com/v1/forecast?${coordinate}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=kn&timezone=GMT`),
                    json(`https://marine-api.open-meteo.com/v1/marine?${coordinate}&current=wave_height,wave_direction,wave_period,ocean_current_velocity,ocean_current_direction&timezone=GMT`)
                ]);
                if (id !== richiestaMeteo) return;
                if (!vento.current || !mare.current || typeof vento.current.time !== 'string' || typeof mare.current.time !== 'string') {
                    throw new Error('Risposta meteo incompleta');
                }
                const v = vento.current;
                const m = mare.current;
                const velocitaCorrente = Number.isFinite(m.ocean_current_velocity) ? m.ocean_current_velocity / 1.852 : null;
                risultato.textContent = `Punto richiesto ${punto.lat.toFixed(4)}, ${punto.lng.toFixed(4)}. Modelli Open-Meteo: vento ${valore(v.wind_speed_10m, 'kn')} da ${valore(v.wind_direction_10m, '°', 0)} (${v.time} UTC); onde ${valore(m.wave_height, 'm')}, direzione ${valore(m.wave_direction, '°', 0)}, periodo ${valore(m.wave_period, 's')}; corrente ${valore(velocitaCorrente, 'kn')} verso ${valore(m.ocean_current_direction, '°', 0)} (${m.time} UTC). Celle modello vicine al punto, non osservazioni.`;
            } catch (errore) {
                if (id !== richiestaMeteo) return;
                console.warn('Previsioni sul punto non disponibili:', errore);
                risultato.textContent = 'Previsioni non disponibili. Verifica la connessione e riprova.';
            }
        }

        document.getElementById('cerca-porti').addEventListener('click', async () => {
            if (map.getZoom() < 11) {
                statoPorti.textContent = 'Ingrandisci la mappa almeno al livello 11 per cercare i porti.';
                return;
            }
            const bounds = map.getBounds();
            const sud = Math.max(-90, bounds.getSouth());
            const nord = Math.min(90, bounds.getNorth());
            const ovest = bounds.getWest();
            const est = bounds.getEast();
            if (ovest < -180 || est > 180 || est - ovest > 2 || nord - sud > 2) {
                statoPorti.textContent = 'Area troppo ampia o oltre il meridiano 180°. Ingrandisci la mappa.';
                return;
            }
            const id = ++richiestaPorti;
            const bbox = `${sud},${ovest},${nord},${est}`;
            const query = `[out:json][timeout:20];(nwr["leisure"="marina"](${bbox});nwr["harbour"="yes"](${bbox}););out center 200;`;
            statoPorti.textContent = 'Ricerca porti OpenStreetMap…';
            try {
                const dati = await json(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
                if (id !== richiestaPorti) return;
                if (!Array.isArray(dati.elements) || dati.remark) throw new Error(dati.remark || 'Risposta Overpass non valida');
                porti.clearLayers();
                let trovati = 0;
                for (const elemento of dati.elements) {
                    const lat = elemento.lat ?? elemento.center?.lat;
                    const lon = elemento.lon ?? elemento.center?.lon;
                    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
                    const etichetta = document.createElement('span');
                    etichetta.textContent = `${elemento.tags?.name || 'Porto senza nome'} · OpenStreetMap, dati indicativi`;
                    L.marker([lat, lon]).bindPopup(etichetta).addTo(porti);
                    trovati += 1;
                }
                statoPorti.textContent = `${trovati} risultati nell'area cercata (massimo 200). Dati OpenStreetMap incompleti o non aggiornati.`;
            } catch (errore) {
                if (id !== richiestaPorti) return;
                console.warn('Ricerca porti non disponibile:', errore);
                statoPorti.textContent = 'Ricerca porti non disponibile. Verifica la connessione e riprova.';
            }
        });
        document.getElementById('rimuovi-porti').addEventListener('click', () => {
            richiestaPorti += 1;
            porti.clearLayers();
            statoPorti.textContent = 'Porti rimossi. I dati OpenStreetMap possono essere incompleti o non aggiornati.';
        });

        return {
            disattiva: () => impostaModo(null, false),
            gestisciClick(punto) {
                if (!modo) return false;
                if (modo === 'meteo') {
                    disegni.clearLayers();
                    L.circleMarker(punto, { radius: 5, color: '#38bdf8' }).addTo(disegni);
                    caricaMeteo(punto);
                } else if (!partenza) {
                    disegni.clearLayers();
                    partenza = punto;
                    L.circleMarker(punto, { radius: 5, color: '#f97316' }).addTo(disegni);
                    risultato.textContent = `Partenza ${punto.lat.toFixed(5)}, ${punto.lng.toFixed(5)}. Tocca il secondo punto.`;
                } else {
                    const distanza = map.distance(partenza, punto) / 1852;
                    L.polyline([partenza, punto], { color: '#f97316', weight: 3, dashArray: '6, 6' }).addTo(disegni);
                    L.circleMarker(punto, { radius: 5, color: '#f97316' }).addTo(disegni);
                    const direzione = distanza < 0.0001 ? 'N/D' : `${rilevamento(partenza, punto).toFixed(0)}° vero`;
                    risultato.textContent = `Arrivo ${punto.lat.toFixed(5)}, ${punto.lng.toFixed(5)} · distanza ortodromica ${distanza.toFixed(2)} NM · rilevamento iniziale ${direzione}. La linea è solo illustrativa e può attraversare la terra.`;
                    partenza = null;
                }
                return true;
            }
        };
    }

    root.creaStrumentiMappa = creaStrumentiMappa;
    if (typeof module !== 'undefined') module.exports = { rilevamento };
})(typeof window !== 'undefined' ? window : globalThis);
