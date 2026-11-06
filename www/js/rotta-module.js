/**
 * ROTTA-MODULE.JS - Dettaglio di una rotta salvata: statistiche, mappa, velocità e tratte per miglio
 */

const CHIAVE_ROTTE_DETTAGLIO = 'navigazione_rotte';
const STILE_MAPPA_ITALIANO_DETTAGLIO = 'https://tiles.openfreemap.org/styles/liberty';
const METRI_PER_MIGLIO = 1852;
const RAGGIO_TERRA_METRI = 6371000;
const GRAFICO_LARGHEZZA = 600;
const GRAFICO_ALTEZZA = 200;

let rottaCorrente = null;
let puntiRotta = [];
let durataGrafico = 0;
let velocitaMassimaGrafico = 1;
let marcatoreCursore = null;
let mappaRotta = null;

document.addEventListener('DOMContentLoaded', inizializzaDettaglio);

function inizializzaDettaglio() {
    rottaCorrente = trovaRottaDaUrl();
    document.getElementById('btn-esporta-gpx').disabled = !rottaCorrente;

    if (!rottaCorrente) {
        mostraErroreDettaglio('Rotta non trovata. Potrebbe essere stata rimossa dall\'archivio.');
        return;
    }

    puntiRotta = preparaPuntiRotta(rottaCorrente.punti);
    calcolaProgressioneRotta();
    document.title = rottaCorrente.nome || 'Rotta';
    document.getElementById('btn-esporta-gpx').addEventListener('click', esportaGpxRotta);

    mostraDettaglioRotta();
}

function leggiRotteSalvate() {
    try {
        const rotte = JSON.parse(localStorage.getItem(CHIAVE_ROTTE_DETTAGLIO) || '[]');
        return Array.isArray(rotte) ? rotte : [];
    } catch {
        return [];
    }
}

function trovaRottaDaUrl() {
    const id = new URLSearchParams(location.search).get('id');
    return leggiRotteSalvate().find((rotta) => String(rotta.id) === id) || null;
}

function preparaPuntiRotta(puntiGrezzi) {
    if (!Array.isArray(puntiGrezzi)) return [];
    return puntiGrezzi
        .map((punto) => ({
            lat: Number(punto.lat),
            lon: Number(punto.lon),
            vel: Number(punto.vel) || 0,
            ora: Date.parse(punto.time)
        }))
        .filter((punto) => Number.isFinite(punto.lat) && Number.isFinite(punto.lon) && Number.isFinite(punto.ora))
        .sort((a, b) => a.ora - b.ora);
}

// Aggiunge a ogni punto i secondi trascorsi dalla partenza e le miglia percorse fino a quel punto
function calcolaProgressioneRotta() {
    const inizio = puntiRotta[0]?.ora ?? 0;
    const distanzaGeometrica = puntiRotta.slice(1).reduce((totale, punto, indice) =>
        totale + distanzaMetri(puntiRotta[indice], punto) / METRI_PER_MIGLIO, 0
    );
    const distanzaSalvata = Number(rottaCorrente.distanza);
    const distanzaSalvataValida = Number.isFinite(distanzaSalvata) && distanzaSalvata > 0 && distanzaGeometrica > 0;
    const fattoreScala = distanzaSalvataValida ? distanzaSalvata / distanzaGeometrica : 1;
    let miglia = 0;
    puntiRotta.forEach((punto, indice) => {
        punto.secondi = (punto.ora - inizio) / 1000;
        if (indice > 0) {
            const puntoPrecedente = puntiRotta[indice - 1];
            const migliaTratta = (distanzaMetri(puntoPrecedente, punto) / METRI_PER_MIGLIO) * fattoreScala;
            miglia += migliaTratta;

            const durataTratta = punto.secondi - puntoPrecedente.secondi;
            if (distanzaSalvataValida && durataTratta > 0) {
                punto.vel = (migliaTratta / durataTratta) * 3600;
            }
        }
        punto.miglia = miglia;
    });
}

function distanzaMetri(a, b) {
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * RAGGIO_TERRA_METRI * Math.asin(Math.min(1, Math.sqrt(h)));
}

// La durata salvata è una stringa "mm:ss" (o "hh:mm:ss"); in mancanza si usano le date
function durataRottaSecondi() {
    const parti = String(rottaCorrente.durata || '').split(':').map(Number);
    if (rottaCorrente.durata && parti.every(Number.isFinite)) {
        return parti.reduce((totale, valore) => totale * 60 + valore, 0);
    }
    const differenza = (Date.parse(rottaCorrente.dataFineUTC) - Date.parse(rottaCorrente.dataInizioUTC)) / 1000;
    if (Number.isFinite(differenza) && differenza > 0) return differenza;
    return puntiRotta.at(-1)?.secondi ?? 0;
}

function mostraDettaglioRotta() {
    const distanza = Number.isFinite(Number(rottaCorrente.distanza))
        ? Number(rottaCorrente.distanza)
        : (puntiRotta.at(-1)?.miglia ?? 0);
    const durata = durataRottaSecondi();
    const velocitaMedia = durata > 0 ? distanza / (durata / 3600) : 0;
    const velocitaMassima = puntiRotta.reduce((massimo, punto) => Math.max(massimo, punto.vel), 0);

    document.getElementById('rotta-nome').textContent = rottaCorrente.nome || 'Navigazione';
    document.getElementById('rotta-sottotitolo').textContent = [rottaCorrente.data, rottaCorrente.imbarcazione]
        .filter(Boolean)
        .join(' · ');
    document.getElementById('r-distanza').textContent = distanza.toFixed(2);
    document.getElementById('r-durata').textContent = formattaDurataLunga(durata);
    document.getElementById('r-vel-media').textContent = velocitaMedia.toFixed(1);
    document.getElementById('r-vel-max').textContent = velocitaMassima.toFixed(1);
    document.getElementById('r-partenza').textContent = formattaOra(rottaCorrente.dataInizioUTC || puntiRotta[0]?.ora);
    document.getElementById('r-arrivo').textContent = formattaOra(rottaCorrente.dataFineUTC || puntiRotta.at(-1)?.ora);
    document.getElementById('r-punti').textContent = puntiRotta.length;
    document.getElementById('r-barca').textContent = rottaCorrente.imbarcazione || 'Non specificata';
    document.getElementById('rotta-contenuto').hidden = false;

    const tracciatoValido = puntiRotta.length >= 2;
    document.getElementById('rotta-stato-tracciato').hidden = tracciatoValido;
    document.getElementById('sezione-mappa').hidden = !tracciatoValido;
    document.getElementById('sezione-velocita').hidden = !tracciatoValido;
    document.getElementById('sezione-tratte').hidden = !tracciatoValido;
    if (!tracciatoValido) return;

    disegnaMappaRotta();
    disegnaGraficoVelocita();
    disegnaTratteMiglio();
}

function disegnaMappaRotta() {
    mappaRotta = L.map('rotta-mappa', { zoomControl: false, preferCanvas: true });
    caricaBaseMappaRotta(mappaRotta).finally(() => {
        L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(mappaRotta);
    });

    const percorso = puntiRotta.map((punto) => [punto.lat, punto.lon]);
    const linea = L.polyline(percorso, { color: '#0ea5e9', weight: 4, lineJoin: 'round' }).addTo(mappaRotta);
    L.circleMarker(percorso[0], {
        radius: 7, color: '#fff', weight: 2, fillColor: '#10b981', fillOpacity: 1
    }).bindTooltip('Partenza').addTo(mappaRotta);
    L.circleMarker(percorso[percorso.length - 1], {
        radius: 7, color: '#fff', weight: 2, fillColor: '#ef4444', fillOpacity: 1
    }).bindTooltip('Arrivo').addTo(mappaRotta);

    marcatoreCursore = L.circleMarker(percorso[0], {
        radius: 6, color: '#fff', weight: 2, fillColor: '#38bdf8', fillOpacity: 1
    });

    mappaRotta.fitBounds(linea.getBounds(), { padding: [30, 30] });
}

// Stile vettoriale come in mappa-module.js: etichette in italiano, con ripiego su OpenStreetMap
function caricaBaseMappaRotta(mappa) {
    return fetch(STILE_MAPPA_ITALIANO_DETTAGLIO)
        .then((risposta) => {
            if (!risposta.ok) throw new Error(`HTTP ${risposta.status}`);
            return risposta.json();
        })
        .then((stile) => {
            stile.layers.forEach((layer) => {
                const testo = layer.layout && layer.layout['text-field'];
                if (testo !== undefined) layer.layout['text-field'] = ['coalesce', ['get', 'name:it'], testo];
            });
            L.maplibreGL({ style: stile }).addTo(mappa);
        })
        .catch((errore) => {
            console.warn('Stile italiano non disponibile, uso OpenStreetMap:', errore);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(mappa);
        });
}

function disegnaGraficoVelocita() {
    durataGrafico = puntiRotta.at(-1).secondi || 1;
    velocitaMassimaGrafico = Math.max(1, ...puntiRotta.map((punto) => punto.vel));

    const coordinate = puntiRotta.map((punto) => [
        (punto.secondi / durataGrafico) * GRAFICO_LARGHEZZA,
        GRAFICO_ALTEZZA - (punto.vel / velocitaMassimaGrafico) * (GRAFICO_ALTEZZA - 12) - 6
    ]);
    const linea = coordinate
        .map(([x, y], indice) => `${indice === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
        .join(' ');
    const area = `${linea} L${GRAFICO_LARGHEZZA} ${GRAFICO_ALTEZZA} L0 ${GRAFICO_ALTEZZA} Z`;

    document.getElementById('area-velocita').setAttribute('d', area);
    document.getElementById('linea-velocita').setAttribute('d', linea);

    const contenitore = document.getElementById('rotta-grafico');
    contenitore.addEventListener('pointerdown', evidenziaPuntoGrafico);
    contenitore.addEventListener('pointermove', evidenziaPuntoGrafico);
    contenitore.addEventListener('pointerleave', nascondiCursoreGrafico);
}

function evidenziaPuntoGrafico(evento) {
    const contenitore = document.getElementById('rotta-grafico');
    const rect = contenitore.getBoundingClientRect();
    const frazione = Math.min(1, Math.max(0, (evento.clientX - rect.left) / rect.width));
    const tempoCercato = frazione * durataGrafico;

    const punto = puntiRotta.reduce((migliore, corrente) =>
        Math.abs(corrente.secondi - tempoCercato) < Math.abs(migliore.secondi - tempoCercato) ? corrente : migliore
    );

    const cursore = document.getElementById('cursore-grafico');
    cursore.style.left = `${frazione * 100}%`;
    cursore.style.opacity = '1';

    document.getElementById('rotta-lettura').textContent =
        `${formattaMinutiSecondi(punto.secondi)} dalla partenza · ${punto.vel.toFixed(1)} kn · ${punto.miglia.toFixed(2)} Nm`;

    if (mappaRotta) {
        marcatoreCursore.setLatLng([punto.lat, punto.lon]);
        if (!mappaRotta.hasLayer(marcatoreCursore)) marcatoreCursore.addTo(mappaRotta);
    }
}

function nascondiCursoreGrafico() {
    document.getElementById('cursore-grafico').style.opacity = '0';
    document.getElementById('rotta-lettura').textContent =
        'Scorri il grafico per vedere velocità e posizione sulla mappa.';
    if (mappaRotta && mappaRotta.hasLayer(marcatoreCursore)) marcatoreCursore.remove();
}

function disegnaTratteMiglio() {
    const lista = document.getElementById('rotta-tratte');
    const miglioCompleti = Math.floor(puntiRotta.at(-1).miglia);
    if (miglioCompleti < 1) {
        lista.innerHTML = '<li class="rotta-nota">Nessuna tratta completa da 1 Nm.</li>';
        return;
    }

    const tratte = [];
    let indice = 0;
    let tempoPrecedente = 0;
    for (let miglio = 1; miglio <= miglioCompleti; miglio++) {
        while (indice < puntiRotta.length - 1 && puntiRotta[indice].miglia < miglio) indice++;
        const tempoAttuale = puntiRotta[indice].secondi;
        const durataTratta = tempoAttuale - tempoPrecedente;
        tratte.push({
            numero: miglio,
            durata: durataTratta,
            velocita: durataTratta > 0 ? 3600 / durataTratta : 0
        });
        tempoPrecedente = tempoAttuale;
    }

    const velocitaMassima = Math.max(...tratte.map((tratta) => tratta.velocita));
    lista.innerHTML = tratte.map((tratta) => `
        <li class="rotta-tratta ${tratta.velocita === velocitaMassima ? 'piu-veloce' : ''}">
            <span class="rotta-tratta-numero">${tratta.numero} Nm</span>
            <div class="rotta-tratta-barra">
                <span style="width: ${velocitaMassima > 0 ? (tratta.velocita / velocitaMassima) * 100 : 0}%"></span>
            </div>
            <span class="rotta-tratta-valori">
                <strong>${tratta.velocita.toFixed(1)} kn</strong> · ${formattaMinutiSecondi(tratta.durata)}
            </span>
        </li>
    `).join('');
}

function esportaGpxRotta() {
    if (puntiRotta.length < 2) return;

    const trkpt = puntiRotta.map((punto) =>
        `\n      <trkpt lat="${punto.lat.toFixed(6)}" lon="${punto.lon.toFixed(6)}"><time>${new Date(punto.ora).toISOString()}</time><extensions><speed>${punto.vel.toFixed(2)}</speed></extensions></trkpt>`
    ).join('');
    const nome = rottaCorrente.nome || 'Rotta Poseidon';
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Poseidon" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${escapeXmlDettaglio(nome)}</name><trkseg>${trkpt}\n    </trkseg></trk></gpx>`;

    const blob = new Blob([gpx], { type: 'application/gpx+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${nome.replace(/[^\w-]+/g, '_')}.gpx`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function mostraErroreDettaglio(messaggio) {
    document.getElementById('rotta-contenuto').hidden = true;
    document.getElementById('rotta-errore').hidden = false;
    document.getElementById('rotta-errore-testo').textContent = messaggio;
}

function formattaDurataLunga(secondi) {
    const totale = Math.round(secondi);
    const ore = Math.floor(totale / 3600);
    const minuti = Math.floor((totale % 3600) / 60);
    const sec = totale % 60;
    if (ore > 0) return `${ore} h ${String(minuti).padStart(2, '0')} min`;
    return `${minuti} min ${String(sec).padStart(2, '0')} s`;
}

function formattaMinutiSecondi(secondi) {
    const totale = Math.round(secondi);
    return `${Math.floor(totale / 60)}:${String(totale % 60).padStart(2, '0')}`;
}

function formattaOra(valore) {
    const data = new Date(valore);
    if (Number.isNaN(data.getTime())) return '--';
    return data.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function escapeXmlDettaglio(valore) {
    return String(valore ?? '').replace(/[&<>'"]/g, (carattere) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;'
    }[carattere]));
}
