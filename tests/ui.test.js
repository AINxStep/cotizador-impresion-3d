'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Calc = require('../js/calc.js');
const Defaults = require('../js/defaults.js');
const mod = require('../js/ui.js');
const UI = mod.UI || globalThis.UI;

const cfg = Defaults.makeConfig();
const jobBase = () => Object.assign(Defaults.makeJob(cfg), {
  lines: [{ materialId: cfg.materials[0].id, g: 40 }], hours: 2, minutes: 0
});

function bindJob(over, mode) {
  const job = Object.assign(jobBase(), over);
  UI.bind({ cfg, job, mode: mode || 'taller', tab: 'cotizar', fromLink: false, imp: null });
  return job;
}

test('qtyLive explica la relación elegida y la unidad de cotización', () => {
  const multi = UI.qtyLive(Calc.jobShape(null, { plates: 3, rel: 'multi', ppp: 12, by: 'piece' }));
  assert.match(multi, /3 placas × 12 piezas por placa = 36 piezas en total/);
  assert.match(multi, /Se cotiza por pieza/);
  assert.match(multi, /cuenta 36 piezas/);
  const split = UI.qtyLive(Calc.jobShape(null, { plates: 3, rel: 'split', ppl: 3, by: 'plate' }));
  assert.match(split, /3 placas ÷ 3 placas por pieza = 1 pieza en total/);
  assert.match(split, /Se cotiza por placa/);
  assert.match(split, /cuenta 3 placas/);
});

test('el formulario ofrece la relación, las piezas por placa o placas por pieza, y "cotizar por"', () => {
  bindJob({ rel: 'multi', ppp: 4 });
  const multi = UI.jobForm(null);
  assert.match(multi, /data-path="job\.rel"/);
  assert.match(multi, /data-path="job\.by"/);
  assert.match(multi, /data-path="job\.ppp"/);
  assert.ok(!multi.includes('data-path="job.ppl"'));
  assert.match(multi, /data-live="qty"/);
  bindJob({ rel: 'split', ppl: 3 });
  const split = UI.jobForm(null);
  assert.match(split, /data-path="job\.ppl"/);
  assert.ok(!split.includes('data-path="job.ppp"'));
  assert.match(split, /<option value="split" selected>/);
});

test('la pestaña de cotización ofrece empezar una cotización nueva', () => {
  bindJob({});
  const h = UI.jobForm(null);
  assert.match(h, /data-act="new-quote"/);
  assert.match(h, /Nueva cotización/);
});

test('resultado del taller: piezas, placas y precio por la unidad elegida', () => {
  const job = bindJob({ plates: 3, rel: 'multi', ppp: 12, by: 'plate' });
  const q = Calc.computeQuote(cfg, job);
  const html = UI.resultTaller(q, cfg);
  assert.match(html, /36 piezas en 3 placas/);
  assert.match(html, /por placa \(sin IVA\)/);
  assert.match(html, /equivale a .* por pieza/);
  const q2 = Calc.computeQuote(cfg, Object.assign({}, job, { by: 'piece', rel: 'split', ppl: 3 }));
  const html2 = UI.resultTaller(q2, cfg);
  assert.match(html2, /1 pieza en 3 placas/);
  assert.match(html2, /por pieza \(sin IVA\)/);
});

test('resultado para el cliente: muestra placas sólo si difieren de las piezas', () => {
  const rates = Calc.deriveRates(cfg);
  const job = bindJob({ plates: 3, rel: 'multi', ppp: 12, by: 'plate' }, 'cliente');
  const html = UI.resultClient(Calc.quoteFromRates(rates, job), rates);
  assert.match(html, /Placas de impresión/);
  assert.match(html, /Precio por placa/);
  const job1 = bindJob({ plates: 2, rel: 'multi', ppp: 1, by: 'piece' }, 'cliente');
  const html1 = UI.resultClient(Calc.quoteFromRates(rates, job1), rates);
  assert.ok(!html1.includes('Placas de impresión'));
  assert.match(html1, /Precio por pieza/);
});

test('texto y hoja de la cotización usan la unidad elegida y la cantidad correcta', () => {
  const job = bindJob({ plates: 3, rel: 'multi', ppp: 12, by: 'plate' });
  const q = Calc.computeQuote(cfg, job);
  const d = UI.customerData(q, cfg.biz, cfg.money, cfg.materials);
  const text = UI.quoteText(d);
  assert.match(text, /Piezas: 36 \(en 3 placas\)/);
  assert.match(text, /Precio por placa:/);
  assert.ok(!/costo|utilidad|margen/i.test(text), 'no debe revelar costos');
  const sheet = UI.sheetHtml(d);
  assert.match(sheet, /36 piezas en 3 placas · precio por placa/);
  assert.match(sheet, /<td>3<\/td>/, 'la cantidad de la hoja es la de la unidad de cotización');
  assert.ok(!/utilidad|margen/i.test(sheet));
});

test('el encabezado incluye el selector de tema (auto / claro / oscuro)', () => {
  bindJob({});
  const h = UI.header(null);
  assert.match(h, /data-act="theme"/);
  assert.match(h, /data-theme-val="auto" aria-pressed="true"/, 'sin preferencia queda en automático');
  assert.match(h, /data-theme-val="light"/);
  assert.match(h, /data-theme-val="dark"/);
  UI.bind({ cfg, job: jobBase(), mode: 'taller', tab: 'cotizar', fromLink: false, imp: null, theme: 'dark' });
  assert.match(UI.header(null), /data-theme-val="dark" aria-pressed="true"/);
  UI.bind({ cfg, job: jobBase(), mode: 'cliente', tab: 'cotizar', fromLink: true, imp: null, theme: 'light' });
  assert.match(UI.header({ biz: cfg.biz }), /data-act="theme"/, 'también aparece en el enlace de clientes');
});

test('el archivo con varias placas pide indicar la relación con las piezas', () => {
  const res = { source: 'Bambu Studio', warnings: [], plates: [
    { index: 1, seconds: 3600, grams: 20, filaments: [] }, { index: 2, seconds: 3600, grams: 20, filaments: [] }] };
  const job = bindJob({ plates: 2 });
  UI.bind({ cfg, job, mode: 'taller', tab: 'cotizar', fromLink: false, imp: { res, name: 'a.gcode.3mf', which: 'all', mapping: [], relSet: false } });
  const ask = UI.jobForm(null);
  assert.match(ask, /data-act="rel-split"/);
  assert.match(ask, /data-act="rel-multi"/);
  assert.match(ask, /Las 2 placas forman una sola pieza/);
  UI.bind({ cfg, job, mode: 'taller', tab: 'cotizar', fromLink: false, imp: { res, name: 'a.gcode.3mf', which: 'all', mapping: [], relSet: true } });
  assert.ok(!UI.jobForm(null).includes('data-act="rel-split"'), 'una vez indicada la relación ya no se pregunta');
  const uno = bindJob({ plates: 1 });
  UI.bind({ cfg, job: uno, mode: 'taller', tab: 'cotizar', fromLink: false, imp: { res, name: 'a.gcode.3mf', which: 1, mapping: [], relSet: false } });
  assert.ok(!UI.jobForm(null).includes('data-act="rel-split"'), 'con una sola placa no hay nada que preguntar');
});
