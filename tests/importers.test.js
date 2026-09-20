'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Importers = require('../js/importers.js');
const { fx } = require('./helpers/fixtures.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('3MF laminado: lee placas, tiempo y filamentos (entrada comprimida)', async () => {
  const r = await Importers.importFile(fx('sample.gcode.3mf'));
  assert.equal(r.plates.length, 2);
  assert.equal(r.plates[0].index, 1);
  assert.equal(r.plates[0].seconds, 4038);
  close(r.plates[0].grams, 20.5); // 18.2 + 2.3
  assert.equal(r.plates[0].filaments.length, 2);
  assert.equal(r.plates[0].filaments[0].type, 'PLA');
  assert.equal(r.plates[1].seconds, 7200);
  close(r.plates[1].grams, 40);
  assert.equal(r.plates[1].filaments[0].type, 'PETG');
});

test('3MF con entrada sin comprimir (stored)', async () => {
  const b = fx('stored.3mf');
  const r = await Importers.import3mf(b);
  assert.equal(r.plates.length, 2);
});

test('3MF sin datos de laminado da un mensaje claro', async () => {
  await assert.rejects(() => Importers.import3mf(fx('unsliced.3mf')), (e) => e.code === 'NO_SLICE_INFO' && /laminad/i.test(e.message));
});

test('archivo que no es ZIP', async () => {
  const b = new Blob(['esto no es un zip, solo texto de relleno para superar los 22 bytes']);
  await assert.rejects(() => Importers.import3mf(b), /ZIP|3MF/);
});

test('toRun: una placa concreta', () => {
  const res = { plates: [
    { index: 1, seconds: 4038, grams: 20.5, filaments: [{ type: 'PLA', color: '#fff', grams: 18.2 }, { type: 'PLA', color: '#000', grams: 2.3 }] },
    { index: 2, seconds: 7200, grams: 40, filaments: [{ type: 'PETG', color: '#f00', grams: 40 }] }
  ] };
  const p2 = Importers.toRun(res, 2);
  assert.equal(p2.plates, 1);
  assert.equal(p2.hours, 2);
  assert.equal(p2.minutes, 0);
  close(p2.filaments[0].grams, 40);
});

test('toRun: todas las placas se suman en una corrida (placas heterogéneas)', () => {
  const res = { plates: [
    { index: 1, seconds: 4038, grams: 20.5, filaments: [{ type: 'PLA', color: '#fff', grams: 20.5 }] },
    { index: 2, seconds: 7200, grams: 40, filaments: [{ type: 'PETG', color: '#f00', grams: 40 }] }
  ] };
  const all = Importers.toRun(res, 'all');
  assert.equal(all.plates, 2);
  // tiempo total de la corrida: 11238 s = 187.3 min (suma, no promedio)
  const totalMin = all.hours * 60 + all.minutes;
  assert.ok(Math.abs(totalMin - 11238 / 60) <= 1, `minutos por corrida ${totalMin}`);
  // gramos por corrida: 20.5 + 40 = 60.5 (suma, no promedio)
  const g = all.filaments.reduce((s, f) => s + f.grams, 0);
  close(g, 60.5, 1e-9);
});

test('G-code de Bambu Studio', async () => {
  const r = await Importers.importFile(fx('bambu.gcode'));
  close(r.plates[0].grams, 15.62);
  assert.equal(r.plates[0].seconds, 3912); // 1h 5m 12s
});

test('G-code de OrcaSlicer con dos filamentos', async () => {
  const r = await Importers.importFile(fx('orca.gcode'));
  close(r.plates[0].grams, 16.0);
  assert.equal(r.plates[0].seconds, 7384); // 2h 3m 4s
  assert.deepEqual(r.plates[0].filaments.map((f) => f.type), ['PLA', 'PETG']);
});

test('G-code de PrusaSlicer con días en el tiempo', async () => {
  const r = await Importers.importFile(fx('prusa.gcode'));
  close(r.plates[0].grams, 5.4);
  assert.equal(r.plates[0].seconds, 86400 + 2 * 3600 + 30 * 60 + 15);
});

test('G-code de Cura: sólo tiempo, con advertencia por el peso', async () => {
  const r = await Importers.importFile(fx('cura.gcode'));
  assert.equal(r.plates[0].seconds, 3723);
  assert.ok(r.warnings.some((w) => /peso/i.test(w)));
});

test('formato no soportado', async () => {
  const b = new Blob(['x']);
  b.name = 'modelo.stl';
  await assert.rejects(() => Importers.importFile(b), /Formato no soportado/);
});

test('parseDuration', () => {
  assert.equal(Importers.parseDuration('1h 5m 12s'), 3912);
  assert.equal(Importers.parseDuration('45m 3s'), 2703);
  assert.equal(Importers.parseDuration('2d 0h 0m 0s'), 172800);
  assert.equal(Importers.parseDuration('nada'), 0);
});
