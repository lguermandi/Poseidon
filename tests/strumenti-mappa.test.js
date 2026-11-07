const test = require('node:test');
const assert = require('node:assert/strict');
const { rilevamento } = require('../www/js/strumenti-mappa.js');

test('calcola il rilevamento iniziale vero anche attraversando il meridiano 180', () => {
    assert.ok(Math.abs(rilevamento({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })) < 0.001);
    assert.ok(Math.abs(rilevamento({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) - 90) < 0.001);
    assert.ok(Math.abs(rilevamento({ lat: 0, lng: 179 }, { lat: 0, lng: -179 }) - 90) < 0.001);
    assert.ok(Math.abs(rilevamento({ lat: 0, lng: -179 }, { lat: 0, lng: 179 }) - 270) < 0.001);
});
