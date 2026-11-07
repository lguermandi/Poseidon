const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'www');
const percorso = path.join(root, 'data', 'mediterraneo-12-miglia.geojson');

test('il profilo delle 12 miglia contiene linee nel Mediterraneo', () => {
    const dati = JSON.parse(fs.readFileSync(percorso, 'utf8'));
    assert.equal(dati.type, 'FeatureCollection');
    assert.ok(dati.features.length > 100);

    let puntoAdriatico = false;
    for (const feature of dati.features) {
        assert.equal(feature.type, 'Feature');
        const geometria = feature.geometry;
        assert.ok(['LineString', 'MultiLineString'].includes(geometria.type));
        const linee = geometria.type === 'LineString' ? [geometria.coordinates] : geometria.coordinates;
        for (const linea of linee) {
            assert.ok(linea.length >= 2);
            for (const [lon, lat] of linea) {
                assert.ok(Number.isFinite(lon) && lon >= -7 && lon <= 37);
                assert.ok(Number.isFinite(lat) && lat >= 30 && lat <= 47);
                if (Math.abs(lon - 12.62) < 0.01 && Math.abs(lat - 44.34) < 0.01) puntoAdriatico = true;
            }
        }
    }
    assert.ok(puntoAdriatico, 'profilo adriatico mancante');
});

test('il profilo delle 12 miglia è incluso nella cache offline', () => {
    const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
    assert.match(serviceWorker, /'\.\/data\/mediterraneo-12-miglia\.geojson'/);
});
