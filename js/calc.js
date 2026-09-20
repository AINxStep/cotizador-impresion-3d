/* calc.js — motor de cálculo del cotizador (sin dependencias, funciona en navegador y Node).
 *
 * Dos capas que dan EXACTAMENTE el mismo precio:
 *   1) computeQuote(cfg, job)      → desglose completo de costos (modo Taller).
 *   2) quoteFromRates(rates, job)  → precio a partir de tarifas de venta (modo Cliente).
 *      Las tarifas se derivan con deriveRates(cfg) y NO contienen costos, márgenes ni utilidad.
 *
 * Modelo (resumen):
 *   Producción = material·(1+merma) + máquina(depreciación+mantenimiento) + electricidad
 *   Con fallas = Producción / (1 − tasa de fallas)
 *   Costo      = Con fallas + mano de obra + diseño + postproceso + empaque + indirectos%
 *   Precio base N = Costo / (1 − margen)      (o Costo × multiplicador)
 *   N → urgencia → descuento por volumen → comisión (con "gross-up") → mínimo → envío → redondeo → IVA
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function num(v, d) {
    var n = Number(v);
    return isFinite(n) ? n : (d === undefined ? 0 : d);
  }
  function pos(v) { return Math.max(0, num(v)); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function round(v, dec) { var k = Math.pow(10, dec); return Math.round(v * k) / k; }

  function costPerGram(mat) {
    var g = num(mat && mat.spoolG);
    return g > 0 ? pos(mat.spoolPrice) / g : 0;
  }

  function findById(list, id) {
    for (var i = 0; i < (list || []).length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /** Porcentaje de descuento que corresponde a `count` unidades (piezas o placas, según se cotice). */
  function discountPct(tiers, count) {
    var pct = 0, best = -1;
    (tiers || []).forEach(function (t) {
      var min = pos(t.min);
      if (min > 0 && count >= min && min > best) { best = min; pct = clamp(pos(t.pct), 0, 100); }
    });
    return pct;
  }

  /** Parámetros de la "cola" de precio (urgencia → … → IVA), comunes a ambas capas. */
  function tailFromConfig(cfg) {
    var m = cfg.modules || {};
    var on = function (k) { return m[k] && m[k].on; };
    return {
      rushPct: on('rush') ? pos(m.rush.pct) : 0,
      tiers: on('discounts')
        ? (m.discounts.tiers || []).map(function (t) { return { min: pos(t.min), pct: pos(t.pct) }; })
            .filter(function (t) { return t.min > 0 && t.pct > 0; })
            .sort(function (a, b) { return a.min - b.min; })
        : [],
      feePct: on('fees') ? pos(m.fees.pct) : 0,
      feeFixed: on('fees') ? pos(m.fees.fixed) : 0,
      minAmount: on('minimum') ? pos(m.minimum.amount) : 0,
      roundTo: pos(cfg.money && cfg.money.rounding),
      taxRate: pos(cfg.money && cfg.money.taxRate),
      taxOn: !!(cfg.money && cfg.money.taxOn)
    };
  }

  /**
   * Cola de precio. Recibe el precio base N (ya con margen) y devuelve todos los pasos.
   *  - Comisión con gross-up: P = (N + fija) / (1 − pct)  → tras pagar la comisión te queda N.
   *  - Mínimo: si P < mínimo, se cobra el mínimo.
   *  - Envío: se cobra tal cual (sin margen).
   *  - Redondeo: hacia arriba al múltiplo indicado (sobre subtotal con envío).
   */
  function priceTail(t, N, count, urgent, shipping) {
    var rush = urgent ? N * t.rushPct / 100 : 0;
    var N1 = N + rush;
    var dPct = discountPct(t.tiers, count);
    var discount = N1 * dPct / 100;
    var N2 = N1 - discount;

    var hasFees = t.feePct > 0 || t.feeFixed > 0;
    var feeRate = clamp(t.feePct, 0, 90) / 100;
    var service = hasFees ? (N2 + t.feeFixed) / (1 - feeRate) : N2;

    var minAdj = 0;
    if (t.minAmount > 0 && service < t.minAmount) {
      minAdj = t.minAmount - service;
      service = t.minAmount;
    }
    var fees = hasFees ? service * feeRate + t.feeFixed : 0;

    var ship = pos(shipping);
    var subtotal = service + ship;
    var roundAdj = 0;
    if (t.roundTo > 0) {
      var r = Math.ceil(subtotal / t.roundTo - 1e-9) * t.roundTo;
      roundAdj = r - subtotal;
      subtotal = r;
    }
    var tax = t.taxOn ? subtotal * t.taxRate / 100 : 0;
    return {
      rush: rush, discountPct: dPct, discount: discount,
      fees: fees, minAdj: minAdj, minApplied: minAdj > 0,
      service: service, ship: ship, roundAdj: roundAdj,
      subtotal: subtotal, tax: tax, total: subtotal + tax
    };
  }

  /**
   * Cantidades del trabajo. Los datos de impresión (gramos, tiempo) son TOTALES POR CORRIDA:
   * una corrida es imprimir todas las placas del proyecto una vez, y el pedido puede repetir
   * el proyecto `runs` veces. Así:
   *   placas físicas totales = placas_por_corrida × corridas
   * De las placas totales dependen el manejo por placa y la purga; de las corridas, el material
   * y el tiempo de máquina; de las piezas, el postprocesado y el precio unitario.
   * La relación entre placas y piezas la indica el usuario:
   *   rel 'multi' (por defecto): varias piezas en cada placa  → piezas = placas × piezas_por_placa
   *   rel 'split':               una pieza se reparte en varias placas → piezas = placas ÷ placas_por_pieza
   * `by` ('piece' | 'plate') indica por qué se cotiza: define el precio unitario que se muestra
   * y con qué cantidad se cuenta el descuento por volumen.
   * Trabajos antiguos sin `runs` se toman como una sola corrida.
   */
  function jobShape(cfg, job) {
    var platesRun = pos(job.plates);
    var runs = job.runs == null ? 1 : pos(job.runs);
    var plates = platesRun * runs;
    var split = job.rel === 'split';
    var ppp = Math.max(1, Math.floor(pos(job.ppp)) || 1);
    var ppl = Math.max(1, pos(job.ppl) || 1);
    var pieces = split ? plates / ppl : plates * ppp;
    var byPlate = job.by === 'plate';
    return {
      plates: plates,
      platesRun: platesRun,
      runs: runs,
      split: split,
      ppp: ppp,
      ppl: ppl,
      pieces: pieces,
      byPlate: byPlate,
      units: byPlate ? plates : pieces,
      minutesPerRun: pos(job.hours) * 60 + pos(job.minutes)
    };
  }

  /** Precios unitarios a partir del ingreso por el servicio. */
  function unitPrices(revenue, s) {
    var perPiece = s.pieces > 0 ? revenue / s.pieces : 0;
    var perPlate = s.plates > 0 ? revenue / s.plates : 0;
    return { unit: s.byPlate ? perPlate : perPiece, unitPiece: perPiece, unitPlate: perPlate };
  }

  /** Avisos sobre la relación piezas/placas (no revelan costos; se muestran en ambos modos). */
  function shapeNotes(s) {
    var notes = [];
    if (s.split && s.plates > 0 && Math.abs(s.pieces - Math.round(s.pieces)) > 1e-9) {
      notes.push({ level: 'info', text: 'El número de placas no es múltiplo de las placas por pieza: se cotizan ' + round(s.pieces, 2) + ' piezas.' });
    }
    return notes;
  }

  /** Desglose completo de costos y precio (modo Taller). */
  function computeQuote(cfg, job) {
    var mods = cfg.modules || {};
    var on = function (k) { return !!(mods[k] && mods[k].on); };
    var s = jobShape(cfg, job);
    var plates = s.plates, pieces = s.pieces;

    var printer = findById(cfg.printers, job.printerId) || (cfg.printers || [])[0] ||
      { price: 0, lifeH: 1, salvagePct: 0, powerW: 0, maintPerH: 0 };

    // ---- Material (con merma y purga extra) ----
    var lines = (job.lines || []).map(function (l) {
      return { mat: findById(cfg.materials, l.materialId), g: pos(l.g) };
    }).filter(function (l) { return l.mat; });

    var primary = -1, maxG = -1;
    lines.forEach(function (l, i) { if (l.g > maxG) { maxG = l.g; primary = i; } });

    var waste = pos(cfg.risk && cfg.risk.wastePct) / 100;
    var purgePerPlate = on('multicolor') ? pos(job.purgeG) : 0;
    var material = 0, gramsBilled = 0, gramsNet = 0;
    lines.forEach(function (l, i) {
      var g = l.g * s.runs * (1 + waste);
      if (i === primary) g += purgePerPlate * plates;
      gramsNet += l.g * s.runs;
      gramsBilled += g;
      material += g * costPerGram(l.mat);
    });

    // ---- Máquina y energía ---- (tiempo por corrida × corridas; minutos extra por placa)
    var H = (s.minutesPerRun * s.runs + (on('multicolor') ? pos(job.extraMin) : 0) * plates) / 60;
    var life = pos(printer.lifeH);
    var deprPerH = life > 0 ? pos(printer.price) * (1 - clamp(pos(printer.salvagePct), 0, 100) / 100) / life : 0;
    var depreciation = H * deprPerH;
    var maintenance = H * pos(printer.maintPerH);
    var kwh = H * pos(printer.powerW) / 1000;
    var electricity = kwh * pos(cfg.energy && cfg.energy.pricePerKwh);

    var production = material + depreciation + maintenance + electricity;
    var failRate = clamp(pos(cfg.risk && cfg.risk.failPct), 0, 90) / 100;
    var failure = production * (1 / (1 - failRate) - 1);

    // ---- Mano de obra y módulos ----
    var lab = cfg.labor || {};
    var labor = (pos(lab.prepMin) + pos(lab.plateMin) * plates) / 60 * pos(lab.rate);
    var design = on('design') ? pos(job.designH) * pos(mods.design.rate) : 0;
    var postLabor = on('post') ? pos(job.postMin) * pieces / 60 * pos(mods.post.rate) : 0;
    var postSupplies = on('post') ? pos(job.supplies) * pieces : 0;
    var packaging = on('packaging') ? pos(mods.packaging.perOrder) : 0;

    var subtotalCost = production + failure + labor + design + postLabor + postSupplies + packaging;
    var overhead = subtotalCost * pos(cfg.risk && cfg.risk.overheadPct) / 100;
    var cost = subtotalCost + overhead;

    // ---- Margen ----
    var pr = cfg.pricing || {};
    var N;
    if (pr.method === 'markup') N = cost * Math.max(0, num(pr.markup, 1));
    else N = cost / (1 - clamp(pos(pr.marginPct), 0, 95) / 100);

    // IVA por cotización: se cobra si el taller lo maneja Y el trabajo no lo apaga
    var taxOn = !!(cfg.money && cfg.money.taxOn) && job.taxOn !== false;
    var tail = priceTail(Object.assign(tailFromConfig(cfg), { taxOn: taxOn }), N, s.units, !!job.urgent && on('rush'), job.shipping);

    var revenue = tail.service + tail.roundAdj;            // ingreso por el servicio (sin envío ni IVA)
    var profit = revenue - tail.fees - cost;
    var marginEff = revenue > 0 ? profit / revenue : 0;
    var up = unitPrices(revenue, s);

    var notes = shapeNotes(s);
    if (tail.minApplied) notes.push({ level: 'info', text: 'Se aplicó el pedido mínimo: el costo calculado es menor al mínimo configurado.' });
    if (pr.method === 'markup' && !(pos(pr.markup) > 0)) notes.push({ level: 'warn', text: 'El multiplicador es 0 o está vacío: el precio sale en $0. En Configuración debe ser mayor que cero.' });
    if (revenue > 0 && profit < 0) notes.push({ level: 'warn', text: 'El precio queda por debajo del costo. Revisa el margen, el descuento por volumen o las comisiones.' });
    else if (revenue > 0 && marginEff < 0.1) notes.push({ level: 'warn', text: 'El margen real es menor al 10 %. Es poco colchón para imprevistos.' });
    if (!lines.length) notes.push({ level: 'warn', text: 'No hay material seleccionado en la cotización.' });

    return {
      plates: plates, platesRun: s.platesRun, runs: s.runs, pieces: pieces, byPlate: s.byPlate, units: s.units, hours: H, gramsNet: gramsNet, gramsBilled: gramsBilled, kwh: kwh,
      costs: {
        material: material, depreciation: depreciation, maintenance: maintenance, electricity: electricity,
        failure: failure, labor: labor, design: design, postLabor: postLabor, postSupplies: postSupplies,
        packaging: packaging, overhead: overhead
      },
      cost: cost, N: N, marginAmount: N - cost,
      rush: tail.rush, discountPct: tail.discountPct, discount: tail.discount,
      fees: tail.fees, minAdj: tail.minAdj, minApplied: tail.minApplied,
      service: tail.service, ship: tail.ship, roundAdj: tail.roundAdj,
      subtotal: tail.subtotal, tax: tail.tax, total: tail.total, taxOn: taxOn,
      unit: up.unit, unitPiece: up.unitPiece, unitPlate: up.unitPlate,
      profit: profit, marginEff: marginEff, profitPerHour: H > 0 ? profit / H : 0,
      notes: notes
    };
  }

  /**
   * Deriva las tarifas de venta públicas. Como el precio base N es afín en cada variable
   * (gramos, horas, placas, minutos de postproceso…), los coeficientes se obtienen
   * "sondeando" el propio motor: así ambas capas nunca se desincronizan.
   */
  function deriveRates(cfg) {
    var mods = cfg.modules || {};
    var on = function (k) { return !!(mods[k] && mods[k].on); };
    var multi = on('multicolor');
    var firstPrinter = (cfg.printers || [])[0];
    var zero = {
      printerId: firstPrinter ? firstPrinter.id : '', lines: [], hours: 0, minutes: 0,
      plates: 0, ppp: 1, designH: 0, postMin: 0, supplies: 0, purgeG: 0, extraMin: 0, urgent: false, shipping: 0
    };
    var N = function (patch) { return computeQuote(cfg, Object.assign({}, zero, patch)).N; };
    var r6 = function (v) { return round(v, 6); };

    var base0 = N({});
    var base1 = N({ plates: 1 });
    var t = tailFromConfig(cfg);

    return {
      v: 1,
      biz: {
        name: (cfg.biz && cfg.biz.name) || '', contact: (cfg.biz && cfg.biz.contact) || '',
        notes: (cfg.biz && cfg.biz.notes) || '', validityDays: pos(cfg.biz && cfg.biz.validityDays)
      },
      money: { code: (cfg.money && cfg.money.code) || 'MXN', taxRate: t.taxRate, taxOn: t.taxOn, rounding: t.roundTo },
      mats: (cfg.materials || []).map(function (m) {
        return {
          id: m.id, name: m.name,
          pg: r6((N({ plates: 1, lines: [{ materialId: m.id, g: 1000 }] }) - base1) / 1000),
          // la purga se cobra como gramos del material principal, SIN merma
          pgPurge: multi ? r6((N({ plates: 1, lines: [{ materialId: m.id, g: 0 }], purgeG: 1000 }) - base1) / 1000) : 0
        };
      }),
      machines: (cfg.printers || []).map(function (p) {
        return { id: p.id, name: p.name, ph: r6((N({ plates: 1, printerId: p.id, hours: 100 }) - base1) / 100) };
      }),
      base: {
        job: r6(base0),
        plate: r6(base1 - base0),
        designH: on('design') ? r6((N({ plates: 1, designH: 100 }) - base1) / 100) : 0,
        postMin: on('post') ? r6((N({ plates: 1, ppp: 1, postMin: 1000 }) - base1) / 1000) : 0,
        supply: on('post') ? r6((N({ plates: 1, ppp: 1, supplies: 1000 }) - base1) / 1000) : 0
      },
      mods: { design: on('design'), post: on('post'), rush: on('rush') && t.rushPct > 0, multicolor: multi },
      tail: {
        rushPct: t.rushPct, tiers: t.tiers, feePct: t.feePct, feeFixed: t.feeFixed,
        minAmount: t.minAmount, roundTo: t.roundTo, taxRate: t.taxRate, taxOn: t.taxOn
      }
    };
  }

  /** Tarifas para el enlace de clientes: las del taller, con el IVA efectivo de la
   *  cotización actual — si el trabajo tiene el IVA apagado, el enlace tampoco lo cobra. */
  function linkRates(cfg, job) {
    var r = deriveRates(cfg);
    var taxOn = r.money.taxOn && !(job && job.taxOn === false);
    r.money.taxOn = taxOn;
    r.tail.taxOn = taxOn;
    return r;
  }

  /** Trabajo saneado a partir de un objeto cualquiera (el que viaja en un enlace de
   *  cotización cerrada). Sólo cantidades públicas: nunca costos ni márgenes. */
  function publicJob(j) {
    j = j && typeof j === 'object' ? j : {};
    var lines = Array.isArray(j.lines) ? j.lines.map(function (l) {
      return { materialId: String(l && l.materialId || ''), g: pos(l && l.g) };
    }).filter(function (l) { return l.materialId; }) : [];
    return {
      name: String(j.name || ''), client: String(j.client || ''),
      printerId: String(j.printerId || ''), lines: lines,
      hours: pos(j.hours), minutes: pos(j.minutes),
      plates: Math.max(1, pos(j.plates) || 1), runs: Math.max(1, pos(j.runs) || 1),
      rel: j.rel === 'split' ? 'split' : 'multi',
      ppp: Math.max(1, pos(j.ppp) || 1), ppl: Math.max(1, pos(j.ppl) || 1),
      by: j.by === 'plate' ? 'plate' : 'piece',
      designH: pos(j.designH), postMin: pos(j.postMin), supplies: pos(j.supplies),
      purgeG: pos(j.purgeG), extraMin: pos(j.extraMin),
      urgent: !!j.urgent, shipping: pos(j.shipping), taxOn: j.taxOn !== false
    };
  }

  /** Tarifas para la calculadora de clientes: colchón del `f` sobre los coeficientes de
   *  precio, marca de "aproximado", y el descuento por volumen pasa a informativo —
   *  no se aplica al precio que calcula el cliente (es decisión del taller, se anuncia). */
  function padRates(rates, f) {
    f = pos(f) || 1;
    var r = JSON.parse(JSON.stringify(rates));
    r.mats.forEach(function (m) { m.pg *= f; m.pgPurge *= f; });
    r.machines.forEach(function (m) { m.ph *= f; });
    ['job', 'plate', 'designH', 'postMin', 'supply'].forEach(function (k) { r.base[k] *= f; });
    r.approx = f > 1;
    r.discountTiers = (r.tail.tiers || []).slice();
    r.tail.tiers = [];
    return r;
  }

  /** Precio a partir de tarifas de venta (modo Cliente). No expone costos. */
  function quoteFromRates(rates, job) {
    var b = rates.base;
    var multi = !!(rates.mods && rates.mods.multicolor);
    var s = jobShape(null, job);
    var plates = s.plates, pieces = s.pieces;
    var H = (s.minutesPerRun * s.runs + (multi ? pos(job.extraMin) : 0) * plates) / 60;

    var N = b.job + b.plate * plates;
    var gramsNet = 0, primary = null;
    (job.lines || []).forEach(function (l) {
      var m = findById(rates.mats, l.materialId);
      if (!m) return;
      var g = pos(l.g) * s.runs;
      gramsNet += g;
      N += g * m.pg;
      if (!primary || g > primary.g) primary = { m: m, g: g };
    });
    if (multi && primary) N += pos(job.purgeG) * plates * (primary.m.pgPurge || 0);
    var mach = findById(rates.machines, job.printerId) || (rates.machines || [])[0];
    if (mach) N += H * mach.ph;
    if (rates.mods.design) N += pos(job.designH) * b.designH;
    if (rates.mods.post) N += pos(job.postMin) * pieces * b.postMin + pos(job.supplies) * pieces * b.supply;

    var taxOn = !!(rates.tail && rates.tail.taxOn) && job.taxOn !== false;
    var tail = priceTail(Object.assign({}, rates.tail, { taxOn: taxOn }), N, s.units, !!job.urgent && rates.mods.rush, job.shipping);
    var revenue = tail.service + tail.roundAdj;
    var up = unitPrices(revenue, s);
    return {
      plates: plates, platesRun: s.platesRun, runs: s.runs, pieces: pieces, byPlate: s.byPlate, units: s.units, hours: H, gramsNet: gramsNet, N: N,
      rush: tail.rush, discountPct: tail.discountPct, discount: tail.discount,
      minApplied: tail.minApplied, service: tail.service, ship: tail.ship, roundAdj: tail.roundAdj,
      subtotal: tail.subtotal, tax: tail.tax, total: tail.total, taxOn: taxOn,
      unit: up.unit, unitPiece: up.unitPiece, unitPlate: up.unitPlate,
      notes: shapeNotes(s)
    };
  }

  return {
    computeQuote: computeQuote,
    deriveRates: deriveRates,
    linkRates: linkRates,
    publicJob: publicJob,
    padRates: padRates,
    quoteFromRates: quoteFromRates,
    priceTail: priceTail,
    tailFromConfig: tailFromConfig,
    discountPct: discountPct,
    jobShape: jobShape,
    costPerGram: costPerGram
  };
});
