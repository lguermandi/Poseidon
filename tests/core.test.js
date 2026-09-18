const test = require('node:test');
const assert = require('node:assert/strict');
const { NavCore, DeviationTable, VectorMath } = require('../www/js/core_navigazione.js');
const { LogicaVela } = require('../www/js/core_vela.js');

test('normalizza gli angoli anche quando sono negativi', () => {
    assert.equal(NavCore.normalizeAngle(-10), 350);
    assert.equal(NavCore.normalizeAngle(370), 10);
});

test('converte una prora in rotta e velocita effettiva', () => {
    assert.deepEqual(VectorMath.calcolaRvVeff(0, 5, 0, 0), { rv: 0, veff: 5 });
    assert.equal(VectorMath.calcolaRs(359, 2), 1);
});

test('interpola la deviazione tra due valori', () => {
    const tabella = new DeviationTable([
        { p: 0, dev: 2 },
        { p: 180, dev: -2 },
        { p: 360, dev: 2 }
    ]);

    assert.equal(tabella.getDeviation(90), 0);
    assert.equal(tabella.getDeviation(359), 2);
});

test('calcola VMG e vento vero', () => {
    assert.equal(LogicaVela.calcolaVMG(60, 4), 2);
    assert.deepEqual(LogicaVela.calcolaVentoVero(0, 0, 10), { tws: 10, twa: 0 });
});
