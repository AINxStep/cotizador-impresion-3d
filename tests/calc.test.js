'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Calc = require('../js/calc.js');
const Defaults = require('../js/defaults.js');

const close = (a, b, eps = 1e-6, msg) =>
  assert.ok(Math.abs(a - b) <= eps, (msg || 'valores distintos') + `: ${a} vs ${b}`);

/** Configuración mínima con números fáciles de verificar a mano. */
function simpleCfg(over = {}) {
  const cfg = {
    v: 1,
    biz: { name: '', contact: '', notes: '', validityDays: 15 },
    money: { code: 'MXN', taxRate: 16, taxOn: true, rounding: 0 },
    printers: [{ id: 'p1', name: 'P', price: 10000, lifeH: 5000, salvagePct: 0, powerW: 200, maintPerH: 1 }],
    materials: [{ id: 'm1', name: 'PLA', spoolPrice: 500, spoolG: 1000 }],
    energy: { pricePerKwh: 2 },
    labor: { rate: 120, prepMin: 30, plateMin: 0 },
    risk: { failPct: 10, wastePct: 10, overheadPct: 0 },
    pricing: { method: 'margin', marginPct: 40, markup: 2.5 },
    modules: {
      design: { on: false, rate: 250 },
      post: { on: false, rate: 150 },
      multicolor: { on: false },
      packaging: { on: false, perOrder: 15 },
      fees: { on: false, pct: 3.5, fixed: 4 },
      minimum: { on: false, amount: 80 },
      rush: { on: false, pct: 30 },
      discounts: { on: false, tiers: [{ min: 5, pct: 5 }, { min: 10, pct: 10 }] }
    }
  };
  return Object.assign(cfg, over);
}
const simpleJob = (over = {}) => Object.assign({
  printerId: 'p1', lines: [{ materialId: 'm1', g: 100 }], hours: 5, minutes: 0,
  plates: 1, ppp: 1, designH: 0, postMin: 0, supplies: 0, purgeG: 0, extraMin: 0, urgent: false, shipping: 0
}, over);

test('caso base verificado a mano', () => {
  // material 100 g ×1.10 ×$0.5 = 55; máquina 5 h × (2 + 1) = 15; electricidad 5 h ×0.2 kW ×$2 = 2
  // producción 72 → con fallas 72/0.9 = 80; mano de obra 0.5 h × 120 = 60 → costo 140
  const q = Calc.computeQuote(simpleCfg(), simpleJob());
  close(q.costs.material, 55);
  close(q.costs.depreciation, 10);
  close(q.costs.maintenance, 5);
  close(q.costs.electricity, 2);
  close(q.costs.failure, 8);
  close(q.costs.labor, 60);
  close(q.cost, 140);
  close(q.N, 140 / 0.6);
  close(q.profit, 140 / 0.6 - 140);
  close(q.marginEff, 0.4);
  close(q.tax, (140 / 0.6) * 0.16);
  close(q.total, (140 / 0.6) * 1.16);
});

test('la tasa de fallas divide entre (1 − tasa), no suma el porcentaje', () => {
  const cfg = simpleCfg();
  cfg.risk.failPct = 20;
  const q = Calc.computeQuote(cfg, simpleJob());
  close(q.costs.failure, 72 / 0.8 - 72);
});

test('multiplicador (markup) en lugar de margen', () => {
  const cfg = simpleCfg();
  cfg.pricing = { method: 'markup', marginPct: 40, markup: 2.5 };
  const q = Calc.computeQuote(cfg, simpleJob());
  close(q.N, 140 * 2.5);
  close(q.marginEff, 1 - 1 / 2.5);
});

test('cantidad de placas multiplica material, tiempo y manejo de placa', () => {
  const cfg = simpleCfg();
  cfg.labor.plateMin = 6;
  const one = Calc.computeQuote(cfg, simpleJob());
  const four = Calc.computeQuote(cfg, simpleJob({ plates: 4, ppp: 2 }));
  close(four.costs.material, one.costs.material * 4);
  close(four.hours, one.hours * 4);
  assert.equal(four.pieces, 8);
  // mano de obra: preparación fija (30 min) + 6 min por placa
  close(four.costs.labor, (30 + 6 * 4) / 60 * 120);
});

test('comisión con gross-up: tras pagarla queda el precio base', () => {
  const cfg = simpleCfg();
  cfg.modules.fees = { on: true, pct: 3.5, fixed: 4 };
  const q = Calc.computeQuote(cfg, simpleJob());
  close(q.service - q.fees, q.N, 1e-9);
  close(q.fees, q.service * 0.035 + 4, 1e-9);
  // la utilidad no baja aunque haya comisión
  close(q.profit, q.N - q.cost, 1e-9);
});

test('pedido mínimo', () => {
  const cfg = simpleCfg();
  cfg.modules.minimum = { on: true, amount: 500 };
  const q = Calc.computeQuote(cfg, simpleJob());
  assert.equal(q.minApplied, true);
  close(q.service, 500);
  assert.ok(q.notes.some((n) => /mínimo/i.test(n.text)));
});

test('urgencia y descuento por volumen', () => {
  const cfg = simpleCfg();
  cfg.modules.rush = { on: true, pct: 30 };
  cfg.modules.discounts = { on: true, tiers: [{ min: 5, pct: 5 }, { min: 10, pct: 10 }] };
  const base = Calc.computeQuote(cfg, simpleJob({ plates: 1, ppp: 1 }));
  const rush = Calc.computeQuote(cfg, simpleJob({ urgent: true }));
  close(rush.service, base.service * 1.3);
  const vol = Calc.computeQuote(cfg, simpleJob({ plates: 5, ppp: 2 })); // 10 piezas → 10 %
  assert.equal(vol.discountPct, 10);
  close(vol.discount, vol.N * 0.1, 1e-9);
  close(vol.service, vol.N * 0.9, 1e-9);
  assert.equal(Calc.discountPct(cfg.modules.discounts.tiers, 4), 0);
  assert.equal(Calc.discountPct(cfg.modules.discounts.tiers, 5), 5);
  assert.equal(Calc.discountPct(cfg.modules.discounts.tiers, 9), 5);
});

test('redondeo hacia arriba, envío sin margen e IVA', () => {
  const cfg = simpleCfg();
  cfg.money.rounding = 10;
  const q = Calc.computeQuote(cfg, simpleJob({ shipping: 99 }));
  close(q.ship, 99);
  assert.equal(q.subtotal % 10, 0);
  assert.ok(q.subtotal >= q.service + 99);
  assert.ok(q.subtotal - (q.service + 99) < 10);
  close(q.tax, q.subtotal * 0.16);
  close(q.total, q.subtotal * 1.16);
});

test('IVA desactivado', () => {
  const cfg = simpleCfg();
  cfg.money.taxOn = false;
  const q = Calc.computeQuote(cfg, simpleJob());
  assert.equal(q.tax, 0);
  close(q.total, q.subtotal);
});

test('postproceso, diseño, empaque, purga y minutos extra', () => {
  const cfg = simpleCfg();
  cfg.modules.design = { on: true, rate: 200 };
  cfg.modules.post = { on: true, rate: 120 };
  cfg.modules.packaging = { on: true, perOrder: 15 };
  cfg.modules.multicolor = { on: true };
  const job = simpleJob({ designH: 1.5, postMin: 30, supplies: 3, plates: 2, ppp: 4, purgeG: 10, extraMin: 6 });
  const q = Calc.computeQuote(cfg, job);
  close(q.costs.design, 300);
  close(q.costs.postLabor, 30 * 8 / 60 * 120); // 8 piezas
  close(q.costs.postSupplies, 3 * 8);
  close(q.costs.packaging, 15);
  // material: (100×2×1.10 + 10×2 de purga) × 0.5
  close(q.costs.material, (100 * 2 * 1.1 + 20) * 0.5);
  close(q.hours, (5 * 60 + 6) / 60 * 2);
});

test('los módulos apagados no suman nada', () => {
  const cfg = simpleCfg();
  const q = Calc.computeQuote(cfg, simpleJob({ designH: 5, postMin: 60, supplies: 9, purgeG: 50, extraMin: 30, urgent: true }));
  assert.equal(q.costs.design, 0);
  assert.equal(q.costs.postLabor, 0);
  assert.equal(q.costs.postSupplies, 0);
  assert.equal(q.rush, 0);
  close(q.cost, 140);
});

test('advierte cuando el precio queda bajo el costo', () => {
  const cfg = simpleCfg();
  cfg.modules.discounts = { on: true, tiers: [{ min: 1, pct: 90 }] };
  const q = Calc.computeQuote(cfg, simpleJob());
  assert.ok(q.profit < 0);
  assert.ok(q.notes.some((n) => n.level === 'warn' && /por debajo del costo/.test(n.text)));
});

test('entradas vacías o inválidas no producen NaN', () => {
  const cfg = simpleCfg();
  const q = Calc.computeQuote(cfg, { printerId: 'x', lines: [], hours: '', minutes: null, plates: 'a', ppp: 0 });
  for (const k of ['cost', 'N', 'subtotal', 'total', 'profit', 'unit']) assert.ok(Number.isFinite(q[k]), k);
});

// ------------------------------------------------------------------
// Consistencia entre el modo Taller y el modo Cliente
// ------------------------------------------------------------------
function rng(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }

test('el precio del modo Cliente coincide con el del modo Taller (config por defecto)', () => {
  const cfg = Defaults.makeConfig();
  cfg.modules.fees.on = true;
  cfg.pricing.method = 'margin';
  const rates = Calc.deriveRates(cfg);
  const rand = rng(42);
  for (let i = 0; i < 300; i++) {
    const job = {
      printerId: cfg.printers[Math.floor(rand() * cfg.printers.length)].id,
      lines: [
        { materialId: cfg.materials[Math.floor(rand() * cfg.materials.length)].id, g: Math.round(rand() * 400) },
        { materialId: cfg.materials[Math.floor(rand() * cfg.materials.length)].id, g: Math.round(rand() * 60) }
      ],
      hours: Math.floor(rand() * 20), minutes: Math.floor(rand() * 60),
      plates: 1 + Math.floor(rand() * 6), ppp: 1 + Math.floor(rand() * 8),
      designH: rand() < 0.3 ? rand() * 3 : 0, postMin: rand() < 0.5 ? Math.round(rand() * 45) : 0,
      supplies: rand() < 0.5 ? Math.round(rand() * 20) : 0,
      purgeG: 0, extraMin: 0, urgent: rand() < 0.3, shipping: rand() < 0.3 ? 120 : 0
    };
    const a = Calc.computeQuote(cfg, job);
    const b = Calc.quoteFromRates(rates, job);
    close(a.total, b.total, 0.01, `total (caso ${i})`);
    close(a.subtotal, b.subtotal, 0.01, `subtotal (caso ${i})`);
    close(a.unit, b.unit, 0.01, `unitario (caso ${i})`);
  }
});

test('la consistencia también se cumple con multiplicador, sin módulos y con IVA apagado', () => {
  const cfg = Defaults.makeConfig();
  cfg.pricing = { method: 'markup', marginPct: 40, markup: 2.7 };
  cfg.money.taxOn = false;
  cfg.money.rounding = 0;
  for (const k of ['design', 'post', 'packaging', 'fees', 'minimum', 'rush', 'discounts']) cfg.modules[k].on = false;
  const rates = Calc.deriveRates(cfg);
  const job = { printerId: cfg.printers[0].id, lines: [{ materialId: cfg.materials[1].id, g: 123 }], hours: 7, minutes: 20, plates: 3, ppp: 2, urgent: true };
  close(Calc.computeQuote(cfg, job).total, Calc.quoteFromRates(rates, job).total, 0.01);
});

test('las tarifas públicas NO contienen costos, márgenes ni utilidad', () => {
  const cfg = Defaults.makeConfig();
  const rates = Calc.deriveRates(cfg);
  const json = JSON.stringify(rates);
  for (const secret of ['spoolPrice', 'lifeH', 'salvagePct', 'powerW', 'maintPerH', 'marginPct', 'markup', 'failPct', 'wastePct', 'overheadPct', 'pricePerKwh', 'prepMin', 'plateMin']) {
    assert.ok(!json.includes(secret), `no debe filtrar ${secret}`);
  }
  // el enlace debe ser razonablemente corto
  assert.ok(json.length < 2500, `tamaño de tarifas: ${json.length}`);
});

test('las tarifas públicas se derivan sólo de módulos activos', () => {
  const cfg = Defaults.makeConfig();
  cfg.modules.design.on = false;
  cfg.modules.post.on = false;
  const rates = Calc.deriveRates(cfg);
  assert.equal(rates.mods.design, false);
  assert.equal(rates.mods.post, false);
  assert.equal(rates.base.designH, 0);
  assert.equal(rates.base.postMin, 0);
});
