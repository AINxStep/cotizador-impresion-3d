/* defaults.js — valores iniciales (todos son EJEMPLOS editables) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Defaults = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var seq = 0;
  function uid(prefix) {
    seq += 1;
    return (prefix || 'id') + '_' + Date.now().toString(36) + seq.toString(36) + Math.random().toString(36).slice(2, 5);
  }

  var CURRENCIES = [
    ['MXN', 'Peso mexicano (MXN)'],
    ['USD', 'Dólar estadounidense (USD)'],
    ['EUR', 'Euro (EUR)'],
    ['COP', 'Peso colombiano (COP)'],
    ['ARS', 'Peso argentino (ARS)'],
    ['CLP', 'Peso chileno (CLP)'],
    ['PEN', 'Sol peruano (PEN)'],
    ['UYU', 'Peso uruguayo (UYU)'],
    ['BRL', 'Real brasileño (BRL)'],
    ['GBP', 'Libra esterlina (GBP)'],
    ['CAD', 'Dólar canadiense (CAD)']
  ];

  /** Configuración del taller: costos, tarifas y módulos. */
  function makeConfig() {
    var h2c = uid('p');
    var generic = uid('p');
    var pla = uid('m');
    var petg = uid('m');
    var tpu = uid('m');
    var asa = uid('m');
    return {
      v: 1,
      biz: {
        name: '',
        contact: '',
        notes: 'Cotización estimada. El precio final se confirma después de revisar el archivo.',
        validityDays: 15
      },
      money: { code: 'MXN', taxRate: 16, taxOn: true, rounding: 5 },
      printers: [
        { id: h2c, name: 'Bambu Lab H2C (ejemplo)', price: 65000, lifeH: 5000, salvagePct: 10, powerW: 300, maintPerH: 2 },
        { id: generic, name: 'Impresora de entrada (ejemplo)', price: 8000, lifeH: 4000, salvagePct: 10, powerW: 120, maintPerH: 1 }
      ],
      materials: [
        { id: pla, name: 'PLA', spoolPrice: 450, spoolG: 1000 },
        { id: petg, name: 'PETG', spoolPrice: 480, spoolG: 1000 },
        { id: tpu, name: 'TPU 95A', spoolPrice: 700, spoolG: 1000 },
        { id: asa, name: 'ASA', spoolPrice: 520, spoolG: 1000 }
      ],
      energy: { pricePerKwh: 2.5 },
      labor: { rate: 120, prepMin: 10, plateMin: 5 },
      risk: { failPct: 8, wastePct: 5, overheadPct: 5 },
      pricing: { method: 'margin', marginPct: 40, markup: 2.5 },
      modules: {
        design: { on: true, rate: 250 },
        post: { on: true, rate: 150 },
        multicolor: { on: false },
        packaging: { on: true, perOrder: 15 },
        fees: { on: false, pct: 3.5, fixed: 4 },
        minimum: { on: true, amount: 80 },
        rush: { on: true, pct: 30 },
        discounts: {
          on: true,
          tiers: [
            { min: 5, pct: 5 },
            { min: 10, pct: 10 },
            { min: 25, pct: 15 }
          ]
        }
      }
    };
  }

  /** Datos de un trabajo concreto (una cotización). */
  function makeJob(cfg) {
    return {
      name: '',
      client: '',
      printerId: cfg && cfg.printers && cfg.printers[0] ? cfg.printers[0].id : '',
      lines: [{ materialId: cfg && cfg.materials && cfg.materials[0] ? cfg.materials[0].id : '', g: 35 }],
      hours: 2,   // gramos y tiempo son TOTALES por corrida (todas las placas del proyecto)
      minutes: 30,
      plates: 1,  // placas por corrida
      runs: 1,    // corridas: veces que se imprime el proyecto completo para cubrir el pedido
      rel: 'multi', // 'multi': varias piezas por placa · 'split': una pieza se reparte en varias placas
      ppp: 1,       // piezas por placa (rel = 'multi')
      ppl: 1,       // placas por pieza (rel = 'split'); admite decimales
      by: 'piece',  // 'piece' | 'plate': unidad del precio unitario y del descuento por volumen
      designH: 0,
      postMin: 0,
      supplies: 0,
      purgeG: 0,
      extraMin: 0,
      urgent: false,
      shipping: 0
    };
  }

  return { uid: uid, makeConfig: makeConfig, makeJob: makeJob, CURRENCIES: CURRENCIES };
});
