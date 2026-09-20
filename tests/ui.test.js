'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Calc = require('../js/calc.js');
const Defaults = require('../js/defaults.js');
// ui.js captura Calc y Defaults como globales al cargarse, igual que en el navegador
globalThis.Calc = Calc;
globalThis.Defaults = Defaults;
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
  assert.match(multi, /3 placas × 12 piezas por placa = 36 piezas del pedido/);
  assert.match(multi, /Se cotiza por pieza/);
  assert.match(multi, /cuenta 36 piezas/);
  const split = UI.qtyLive(Calc.jobShape(null, { plates: 3, rel: 'split', ppl: 3, by: 'plate' }));
  assert.match(split, /3 placas ÷ 3 placas por pieza = 1 pieza del pedido/);
  assert.match(split, /Se cotiza por placa/);
  assert.match(split, /cuenta 3 placas/);
  const corridas = UI.qtyLive(Calc.jobShape(null, { plates: 2, runs: 3, rel: 'multi', ppp: 10, by: 'piece' }));
  assert.match(corridas, /2 placas por corrida × 3 corridas = 6 placas/);
  assert.match(corridas, /6 placas × 10 piezas por placa = 60 piezas del pedido/);
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

test('la tarjeta de impresión pide totales por corrida y las corridas del proyecto', () => {
  bindJob({});
  const h = UI.jobForm(null);
  assert.match(h, /data-path="job\.runs"/, 'pide las corridas');
  assert.match(h, /data-path="job\.plates"/, 'pide las placas por corrida');
  assert.match(h, /g por corrida/, 'los gramos son por corrida');
  assert.match(h, /Tiempo por corrida/, 'el tiempo es por corrida');
  assert.match(h, /Corridas del proyecto/);
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

test('la cotización puede apagar el IVA por trabajo (sólo en modo Taller)', () => {
  bindJob({ taxOn: true });
  const h = UI.jobForm(null);
  assert.match(h, /data-path="job\.taxOn"/);
  assert.match(h, /Cobrar IVA/);
  bindJob({ taxOn: true }, 'cliente');
  assert.ok(!UI.jobForm(Calc.deriveRates(cfg)).includes('data-path="job.taxOn"'), 'el cliente no decide el IVA');
});

test('con IVA apagado la cotización del cliente no menciona el impuesto', () => {
  const rates = Calc.deriveRates(cfg);
  const job = bindJob({ taxOn: false }, 'cliente');
  const q = Calc.quoteFromRates(rates, job);
  const html = UI.resultClient(q, rates);
  assert.ok(!/IVA/.test(html), 'sin líneas de IVA en el resultado');
  assert.ok(!/con IVA/.test(html), 'ni "con IVA" en el encabezado');
  const d = UI.customerData(q, cfg.biz, cfg.money, cfg.materials);
  assert.ok(!/IVA/.test(UI.quoteText(d)), 'ni en el texto copiado');
  assert.ok(!/IVA/.test(UI.sheetHtml(d)), 'ni en la hoja imprimible');
  assert.equal(q.total, q.subtotal, 'el total no incluye IVA');
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

test('cada campo de Cotizar lleva un icono de ayuda con explicación', () => {
  bindJob();
  const form = UI.jobForm(null);
  const labels = form.match(/<label for="/g) || [];
  const helped = form.match(/<label for="[^"]+">[^<]*<span class="help"/g) || [];
  assert.ok(labels.length > 8, 'hay campos en el formulario');
  assert.equal(helped.length, labels.length, 'cada campo tiene su icono «?»');
  assert.match(form, /data-tip="[^"]{10,}/, 'las ayudas traen texto concreto');
  // las casillas también llevan ayuda, fuera del <label> para no alternar la casilla al tocarla
  assert.match(form, /check-row[^]*?Entrega urgente[^]*?data-tip="Aplica el recargo/);
  assert.match(form, /data-tip="Suma el IVA al total/);
});

test('cada campo de Configuración lleva un icono de ayuda con explicación', () => {
  UI.bind({ cfg, job: jobBase(), mode: 'taller', tab: 'config', fromLink: false, imp: null });
  const cv = UI.configView({ link: '', confirmReset: false });
  const labels = cv.match(/<label for="/g) || [];
  const helped = cv.match(/<label for="[^"]+">[^<]*<span class="help"/g) || [];
  assert.ok(labels.length > 15, 'hay campos en la configuración');
  assert.equal(helped.length, labels.length, 'cada campo tiene su icono «?»');
  assert.match(cv, /data-tip="Valor inicial del IVA/, 'las casillas también llevan ayuda');
});

test('pdfSpec arma la hoja del cliente sin costos internos', () => {
  const job = bindJob({ name: 'Soporte', client: 'Ana' });
  const q = Calc.computeQuote(cfg, job);
  const d = UI.customerData(q, cfg.biz, cfg.money, cfg.materials);
  const spec = UI.pdfSpec(d);
  assert.match(spec.rows[0].concept, /Impresión 3D/);
  assert.equal(spec.totals[spec.totals.length - 1][0], 'TOTAL');
  assert.ok(spec.totals.some(function (t) { return /IVA/.test(t[0]); }), 'con IVA activo hay línea de IVA');
  const json = JSON.stringify(spec);
  assert.ok(!/utilidad|margen|costo/i.test(json), 'no lleva datos internos del taller');
  // sin IVA el PDF tampoco lo menciona
  const q0 = Calc.computeQuote(cfg, Object.assign(job, { taxOn: false }));
  const spec0 = UI.pdfSpec(UI.customerData(q0, cfg.biz, cfg.money, cfg.materials));
  assert.ok(!spec0.totals.some(function (t) { return /IVA/.test(t[0]); }), 'sin IVA no hay línea de IVA');
});

test('la primera visita abre en Configuración con aviso de bienvenida', () => {
  UI.bind({ cfg, job: jobBase(), mode: 'taller', tab: 'config', fromLink: false, imp: null, firstRun: true });
  const h = UI.configView({ link: '', confirmReset: false });
  assert.match(h, /Bienvenido/);
  assert.match(h, /data-act="first-done"/);
  UI.bind({ cfg, job: jobBase(), mode: 'taller', tab: 'config', fromLink: false, imp: null, firstRun: false });
  assert.ok(!UI.configView({ link: '', confirmReset: false }).includes('first-done'),
    'sin el aviso cuando ya existe configuración guardada');
});

test('la cotización cerrada es de sólo lectura y dice "Total de la cotización"', () => {
  const rates = Calc.deriveRates(cfg);
  UI.bind({ cfg, job: jobBase(), mode: 'cliente', tab: 'cotizar', fromLink: true, quoteLink: true, imp: null });
  const resumen = UI.quoteSummary(rates);
  assert.match(resumen, /Datos del trabajo/);
  assert.match(resumen, /Contenido/);
  assert.match(resumen, /\d+ h/, 'el tiempo de impresión se muestra');
  assert.ok(!resumen.includes('NaN'), 'sin valores NaN en el resumen');
  assert.ok(!resumen.includes('data-path'), 'la cotización cerrada no lleva campos editables');
  const res = UI.resultClient(Calc.quoteFromRates(rates, jobBase()), rates);
  assert.match(res, /Total de la cotización/);
  assert.ok(!/Precio estimado/.test(res));
});

test('la calculadora de clientes con colchón avisa que el precio es aproximado', () => {
  const padded = Calc.padRates(Calc.deriveRates(cfg), 1.1);
  UI.bind({ cfg, job: jobBase(), mode: 'cliente', tab: 'cotizar', fromLink: true, quoteLink: false, imp: null });
  const res = UI.resultClient(Calc.quoteFromRates(padded, jobBase()), padded);
  assert.match(res, /Precio aproximado/);
  assert.match(res, /la emite el taller/);
  assert.match(res, /Precio estimado/);
  // los descuentos del taller se anuncian como información, no se aplican
  assert.match(res, /descuentos por volumen/);
  assert.match(res, /se aplican en la cotización final/);
  assert.ok(!res.includes('Descuento por volumen incluido'), 'el descuento no sale aplicado en el precio');
  const exactas = Calc.deriveRates(cfg);
  const res2 = UI.resultClient(Calc.quoteFromRates(exactas, jobBase()), exactas);
  assert.ok(!/Precio aproximado/.test(res2), 'sin colchón no hay aviso de aproximación');
});

test('la calculadora de clientes no ofrece trabajo adicional, sólo aclara el alcance', () => {
  bindJob({ urgent: true }, 'cliente');
  const h = UI.jobForm(Calc.padRates(Calc.deriveRates(cfg), 1.1));
  assert.match(h, /Trabajo adicional/);
  assert.match(h, /maquila/);
  assert.match(h, /el taller cotiza por separado/);
  assert.ok(!h.includes('data-path="job.designH"'), 'sin campo de diseño');
  assert.ok(!h.includes('data-path="job.postMin"'), 'sin postprocesado');
  assert.ok(!h.includes('data-path="job.supplies"'), 'sin insumos');
  assert.ok(!h.includes('data-path="job.urgent"'), 'sin urgencia');
  // en Taller la tarjeta sí lleva sus campos
  bindJob({ urgent: false });
  const ht = UI.jobForm(null);
  assert.match(ht, /data-path="job.designH"/);
});

test('el enlace de cotización se genera desde Cotizar; Configuración sólo tiene la calculadora', () => {
  bindJob({ name: 'X' });
  const res = UI.resultTaller(Calc.computeQuote(cfg, jobBase()), cfg);
  assert.match(res, /data-act="gen-quote-link"/);
  const cfgView = UI.configView({ link: '', linkKind: '', confirmReset: false });
  assert.match(cfgView, /data-act="gen-calc-link"/);
  assert.ok(!cfgView.includes('gen-quote-link'), 'la cotización cerrada no se genera desde Configuración');
  // con un enlace de cotización generado, la caja aparece en el resultado, no en Configuración
  UI.bind({ cfg, job: jobBase(), mode: 'taller', tab: 'cotizar', fromLink: false, imp: null, link: 'https://x.test/#c=abc', linkKind: 'quote' });
  assert.match(UI.resultTaller(Calc.computeQuote(cfg, jobBase()), cfg), /id="link-out"/);
  assert.ok(!UI.configView({ link: 'https://x.test/#c=abc', linkKind: 'quote', confirmReset: false }).includes('link-out'),
    'un enlace de cotización no se muestra en la tarjeta de Configuración');
});
