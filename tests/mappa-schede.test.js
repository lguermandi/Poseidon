const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { GpsTrackMetrics } = require('../www/js/core_gps.js');

function avviaMappa() {
    const elementi = new Map();
    function elemento(id) {
        if (!elementi.has(id)) {
            const classi = new Set();
            elementi.set(id, {
                textContent: '', value: '', dataset: {}, style: {},
                classList: {
                    add: nome => classi.add(nome),
                    remove: nome => classi.delete(nome),
                    contains: nome => classi.has(nome),
                    toggle: (nome, attivo) => attivo ? classi.add(nome) : classi.delete(nome)
                },
                setAttribute(nome, valore) { this[nome] = valore; },
                addEventListener(nome, callback) { this[nome] = callback; },
                click() { this.clickListener(); }
            });
            const el = elementi.get(id);
            el.addEventListener = (nome, callback) => { if (nome === 'click') el.clickListener = callback; };
        }
        return elementi.get(id);
    }

    const map = {
        setView() { return this; },
        on(nome, callback) { this[nome] = callback; },
        distance() { return 1852; },
        invalidateSize() {},
        panTo() {}
    };
    const layer = () => ({
        addTo(target) { if (target.layers) target.layers.add(this); return this; },
        setLatLngs() {},
        addLatLng() {},
        addData() {}
    });
    const featureGroup = () => ({
        layers: new Set(),
        addTo() { return this; },
        clearLayers() { this.layers.clear(); },
        removeLayer(item) { this.layers.delete(item); }
    });
    const storage = new Map();
    const localStorage = {
        getItem: key => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: key => storage.delete(key)
    };
    const document = {
        body: { dataset: { scheda: 'posizione' } },
        hidden: false,
        getElementById: elemento,
        querySelectorAll: () => [],
        addEventListener() {}
    };
    const L = {
        map: () => map,
        tileLayer: layer,
        geoJSON: layer,
        featureGroup,
        polyline: layer,
        circleMarker: layer,
        latLng: punto => Array.isArray(punto) ? { lat: punto[0], lng: punto[1] } : punto
    };
    const strumenti = { gestisciClick: () => false, disattiva() {} };
    const context = {
        document, L, GpsTrackMetrics, localStorage, sessionStorage: localStorage,
        navigator: { geolocation: { watchPosition: () => 1, clearWatch() {} } },
        creaStrumentiMappa: () => strumenti,
        fetch: () => new Promise(() => {}),
        console, setTimeout() {}, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
        requestAnimationFrame() {}, alert() {}
    };
    context.window = context;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'www', 'js', 'mappa-module.js'), 'utf8'), context);
    return { context, elemento, map, storage };
}

test('piano e registrazione restano indipendenti durante il cambio di scheda', async () => {
    const { context, elemento, map, storage } = avviaMappa();
    const clickMappa = () => map.click({ latlng: { lat: 44, lng: 12 } });

    clickMappa();
    assert.equal(elemento('apri-pianificazione').disabled, true);
    elemento('strumento-rotta').click();
    clickMappa();
    clickMappa();
    assert.equal(elemento('plan-distanza').textContent, '1.00 Nm');
    assert.equal(elemento('sheet-pianificazione').classList.contains('open'), true);

    context.cambiaScheda('navigazione');
    clickMappa();
    assert.equal(elemento('plan-distanza').textContent, '1.00 Nm');
    await context.avviaGPS();
    assert.equal(JSON.parse(storage.get('navigazione_traccia_attiva')).stato, 'in_corso');
    assert.equal(elemento('plan-distanza').textContent, '1.00 Nm');

    context.cambiaScheda('posizione');
    context.cancellaRotta();
    assert.equal(elemento('plan-distanza').textContent, '0.00 Nm');
    assert.equal(JSON.parse(storage.get('navigazione_traccia_attiva')).stato, 'in_corso');
    context.fermaGPS();
});

test('scartare una registrazione non cancella il piano', async () => {
    const { context, elemento, map } = avviaMappa();
    elemento('strumento-rotta').click();
    map.click({ latlng: { lat: 44, lng: 12 } });
    map.click({ latlng: { lat: 44, lng: 13 } });
    context.cambiaScheda('navigazione');
    await context.avviaGPS();
    context.fermaGPS();
    context.scartaTraccia();
    assert.equal(elemento('plan-distanza').textContent, '1.00 Nm');
    assert.equal(elemento('apri-pianificazione').disabled, false);
});
