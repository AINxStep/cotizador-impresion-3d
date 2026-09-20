/* ui.js — utilidades de formato y constructores de HTML (sin efectos secundarios). */
(function (root) {
  'use strict';
  var Calc = root.Calc;
  var Defaults = root.Defaults;

  var S = null; // estado compartido (lo asigna app.js)
  function bind(state) { S = state; }

  // ------------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------------
  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function getPath(obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }
  function setPath(obj, path, val) {
    var keys = path.split('.');
    var last = keys.pop();
    var o = keys.reduce(function (acc, k) { return acc[k]; }, obj);
    o[last] = val;
  }

  var fmtCache = {};
  function money(n, code) {
    code = code || 'MXN';
    n = isFinite(n) ? n : 0;
    if (Math.abs(n) < 0.005) n = 0; // evita "-$0.00"
    if (!fmtCache[code]) {
      try {
        fmtCache[code] = new Intl.NumberFormat('es-MX', { style: 'currency', currency: code });
      } catch (e) {
        fmtCache[code] = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
    }
    return fmtCache[code].format(n);
  }
  function fmtN(n, dec) {
    n = isFinite(n) ? n : 0;
    return n.toLocaleString('es-MX', { minimumFractionDigits: dec === undefined ? 0 : dec, maximumFractionDigits: dec === undefined ? 2 : dec });
  }
  function pct(x, dec) { return fmtN(x * 100, dec === undefined ? 1 : dec) + ' %'; }
  function duration(hours) {
    var totalMin = Math.round(hours * 60);
    var h = Math.floor(totalMin / 60), m = totalMin % 60;
    if (h === 0) return m + ' min';
    return h + ' h' + (m ? ' ' + m + ' min' : '');
  }

  // Piezas y placas: textos comunes a la pantalla, la cotización copiada y la hoja imprimible
  function plural(n, one, many) { return Math.abs(n - 1) < 1e-9 ? one : many; }
  function unitWord(q) { return q.byPlate ? 'placa' : 'pieza'; }
  function differ(q) { return Math.abs(q.pieces - q.plates) > 1e-9; }
  /** "12 piezas en 3 placas" */
  function qtyText(q) {
    return fmtN(q.pieces) + ' ' + plural(q.pieces, 'pieza', 'piezas') + ' en ' + fmtN(q.plates) + ' ' + plural(q.plates, 'placa', 'placas');
  }
  /** Explicación en vivo de la relación elegida y de la unidad de cotización. */
  function qtyLive(s) {
    var eq = s.split
      ? fmtN(s.plates) + ' ' + plural(s.plates, 'placa', 'placas') + ' ÷ ' + fmtN(s.ppl) + ' ' + plural(s.ppl, 'placa', 'placas') + ' por pieza'
      : fmtN(s.plates) + ' ' + plural(s.plates, 'placa', 'placas') + ' × ' + fmtN(s.ppp) + ' ' + plural(s.ppp, 'pieza', 'piezas') + ' por placa';
    var word = s.byPlate ? 'placa' : 'pieza';
    return eq + ' = ' + fmtN(s.pieces) + ' ' + plural(s.pieces, 'pieza', 'piezas') + ' del pedido. Se cotiza por ' + word +
      ': el descuento por volumen cuenta ' + fmtN(s.units) + ' ' + plural(s.units, s.byPlate ? 'placa' : 'pieza', s.byPlate ? 'placas' : 'piezas') + '.';
  }

  // ------------------------------------------------------------------
  // Campos de formulario (se enlazan por data-path con el estado)
  // ------------------------------------------------------------------
  function idFor(path) { return 'f_' + path.replace(/[^\w]+/g, '_'); }

  function field(o) {
    var v = getPath(S, o.path);
    var id = idFor(o.path);
    var type = o.type || 'number';
    var attrs = 'id="' + id + '" data-path="' + o.path + '"' + (o.rerender ? ' data-rerender' : '');
    var control;
    if (type === 'select' || type === 'select-num') {
      control = '<select ' + attrs + ' data-type="' + type + '">' + o.options.map(function (op) {
        return '<option value="' + esc(op[0]) + '"' + (String(op[0]) === String(v) ? ' selected' : '') + '>' + esc(op[1]) + '</option>';
      }).join('') + '</select>';
    } else if (type === 'textarea') {
      control = '<textarea ' + attrs + ' data-type="text" rows="3">' + esc(v) + '</textarea>';
    } else if (type === 'text') {
      control = '<input ' + attrs + ' data-type="text" type="text" value="' + esc(v) + '"' + (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') + '>';
    } else {
      control = '<input ' + attrs + ' data-type="number" type="number" inputmode="decimal" step="' + (o.step || 'any') + '" min="' + (o.min === undefined ? 0 : o.min) + '" value="' + esc(v) + '">';
    }
    var inner = type === 'textarea' ? control :
      '<div class="inp">' + (o.prefix ? '<span class="prefix">' + esc(o.prefix) + '</span>' : '') + control +
      (o.suffix ? '<span class="suffix">' + esc(o.suffix) + '</span>' : '') + '</div>';
    return '<div class="field' + (o.wide ? ' wide' : '') + '"><label for="' + id + '">' + esc(o.label) + '</label>' + inner +
      (o.hint ? '<small>' + o.hint + '</small>' : '') + (o.live ? '<small data-live="' + o.live + '"' + (o.liveI !== undefined ? ' data-i="' + o.liveI + '"' : '') + '></small>' : '') + '</div>';
  }

  function check(o) {
    var v = getPath(S, o.path);
    return '<label class="check"><input type="checkbox" data-path="' + o.path + '" data-type="check" id="' + idFor(o.path) + '"' +
      (o.rerender ? ' data-rerender' : '') + (v ? ' checked' : '') + '> <span>' + o.label + '</span></label>';
  }

  // ------------------------------------------------------------------
  // Catálogo según el modo (Taller usa la config; Cliente usa las tarifas públicas)
  // ------------------------------------------------------------------
  function catalog(rates) {
    if (S.mode === 'cliente') {
      return { mats: rates.mats, printers: rates.machines, showPrinter: rates.machines.length > 1 };
    }
    return { mats: S.cfg.materials, printers: S.cfg.printers, showPrinter: true };
  }
  function curCode(rates) { return S.mode === 'cliente' ? rates.money.code : S.cfg.money.code; }

  // ------------------------------------------------------------------
  // Encabezado y pestañas
  // ------------------------------------------------------------------
  var LOGO = '<svg viewBox="0 0 32 32" width="34" height="34" aria-hidden="true"><path d="M16 3 28 9.5 16 16 4 9.5z" fill="var(--accent)"/><path d="M4 14.2 16 20.7 28 14.2" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><path d="M4 19.4 16 25.9 28 19.4" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" opacity=".55"/></svg>';

  var ICO = {
    auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/></svg>',
    light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M4.8 4.8l1.5 1.5M17.7 17.7l1.5 1.5M2.5 12h2M19.5 12h2M4.8 19.2l1.5-1.5M17.7 6.3l1.5-1.5"/></svg>',
    dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 13.4A8.5 8.5 0 1 1 10.6 3.5a6.8 6.8 0 0 0 9.9 9.9z"/></svg>'
  };

  /** Selector de tema: automático (sigue al sistema), claro u oscuro. */
  function themeSeg() {
    var t = S.theme || 'auto';
    var items = [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']];
    return '<div class="seg theme" role="group" aria-label="Tema de color">' + items.map(function (x) {
      return '<button type="button" data-act="theme" data-theme-val="' + x[0] + '" aria-pressed="' + (t === x[0]) + '" title="' + x[1] + '" aria-label="' + x[1] + '">' + ICO[x[0]] + '</button>';
    }).join('') + '</div>';
  }

  function header(rates) {
    var biz = S.mode === 'cliente' ? rates.biz : S.cfg.biz;
    var title = S.fromLink && biz.name ? biz.name : 'Cotizador de impresión 3D';
    var sub = S.fromLink ? 'Cotización de impresión 3D' : (biz.name || 'Material, tiempo, mano de obra y margen en un solo lugar');
    var seg = S.fromLink ? '' :
      '<div class="seg" role="group" aria-label="Modo de vista">' +
      '<button type="button" data-act="mode" data-mode="taller" aria-pressed="' + (S.mode === 'taller') + '">Taller</button>' +
      '<button type="button" data-act="mode" data-mode="cliente" aria-pressed="' + (S.mode === 'cliente') + '">Cliente</button></div>';
    return '<header class="topbar"><div class="wrap"><div class="brand">' + LOGO +
      '<div><strong>' + esc(title) + '</strong><span class="sub">' + esc(sub) + '</span></div></div>' + seg + themeSeg() + '</div></header>';
  }

  function tabs() {
    if (S.fromLink || S.mode !== 'taller') return '';
    var items = [['cotizar', 'Cotizar'], ['config', 'Configuración del taller'], ['metodo', 'Metodología']];
    return '<nav class="tabs" aria-label="Secciones"><div class="wrap" role="tablist">' + items.map(function (t) {
      return '<button type="button" role="tab" data-act="tab" data-tab="' + t[0] + '" aria-selected="' + (S.tab === t[0]) + '">' + t[1] + '</button>';
    }).join('') + '</div></nav>';
  }

  // ------------------------------------------------------------------
  // Pestaña "Cotizar"
  // ------------------------------------------------------------------
  function importBox() {
    var imp = S.imp;
    var head = '<label class="drop" data-drop><input type="file" data-act="file" accept=".3mf,.gcode,.gco,.g">' +
      '<strong>Arrastra aquí tu archivo laminado o haz clic para elegirlo</strong>' +
      '<span>.gcode.3mf (Bambu Studio, OrcaSlicer) o .gcode (Bambu, Orca, PrusaSlicer). Se lee en tu navegador; no se sube a ningún servidor.</span></label>';
    if (!imp) return head;
    if (imp.error) return head + '<div class="import-box"><span class="err">' + esc(imp.error) + '</span></div>';
    var res = imp.res;
    var rows = res.plates.map(function (p) {
      return '<tr><td>Placa ' + p.index + '</td><td>' + duration(p.seconds / 3600) + '</td><td>' + fmtN(p.grams, 1) + ' g</td></tr>';
    }).join('');
    var sel = '';
    if (res.plates.length > 1) {
      var opts = '<option value="all"' + (imp.which === 'all' ? ' selected' : '') + '>Todas las placas (' + res.plates.length + ')</option>' +
        res.plates.map(function (p) { return '<option value="' + p.index + '"' + (String(imp.which) === String(p.index) ? ' selected' : '') + '>Sólo la placa ' + p.index + '</option>'; }).join('');
      sel = '<div class="field" style="max-width:320px"><label for="imp-sel">Usar en la cotización</label><div class="inp"><select id="imp-sel" data-act="imp-sel">' + opts + '</select></div></div>';
    }
    var warn = (res.warnings || []).map(function (w) { return '<div class="err">' + esc(w) + '</div>'; }).join('');
    var map = (imp.mapping || []).length ? '<div style="color:var(--muted)">Material asignado: ' + imp.mapping.map(esc).join(' · ') + '. Cámbialo abajo si no coincide.</div>' : '';
    // El archivo trae las placas, pero no dice si forman una sola pieza o varias: lo indica el usuario.
    var n = Number(S.job.plates) || 0;
    var ask = (n > 1 && !imp.relSet)
      ? '<div class="note info" style="margin:12px 0 0"><b>El archivo trae ' + fmtN(n) + ' placas, pero no dice a qué piezas corresponden.</b> Indícalo para cotizar bien:' +
        '<div class="btn-row"><button type="button" class="btn small" data-act="rel-split">Las ' + fmtN(n) + ' placas forman una sola pieza</button>' +
        '<button type="button" class="btn small" data-act="rel-multi">Cada placa lleva sus propias piezas</button></div></div>'
      : '';
    return head + '<div class="import-box"><strong>' + esc(imp.name) + '</strong> <span style="color:var(--muted)">· ' + esc(res.source) + '</span>' +
      '<table><thead><tr><th>Placa</th><th>Tiempo</th><th>Peso</th></tr></thead><tbody>' + rows + '</tbody></table>' + sel + map + warn + ask + '</div>';
  }

  function jobForm(rates) {
    var cat = catalog(rates);
    var code = curCode(rates);
    var job = S.job;
    var mods = S.mode === 'cliente' ? rates.mods : {
      design: S.cfg.modules.design.on, post: S.cfg.modules.post.on, rush: S.cfg.modules.rush.on
    };
    var matOptions = cat.mats.map(function (m) { return [m.id, m.name]; });
    var lines = job.lines.map(function (l, i) {
      var b = 'job.lines.' + i;
      return '<div class="line">' +
        '<div class="inp"><select aria-label="Material ' + (i + 1) + '" data-path="' + b + '.materialId" data-type="select">' +
        matOptions.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === l.materialId ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></div>' +
        '<div class="inp"><input aria-label="Gramos del material ' + (i + 1) + '" type="number" inputmode="decimal" step="any" min="0" data-path="' + b + '.g" data-type="number" value="' + esc(l.g) + '"><span class="suffix">g por placa</span></div>' +
        (job.lines.length > 1 ? '<button type="button" class="icon-btn" data-act="rm-line" data-i="' + i + '" aria-label="Quitar material">×</button>' : '<span></span>') + '</div>';
    }).join('');

    var printer = cat.showPrinter ? field({ path: 'job.printerId', type: 'select', label: 'Impresora', options: cat.printers.map(function (p) { return [p.id, p.name]; }), wide: true }) : '';

    var print =
      '<section class="card"><h2>Datos de la impresión</h2><p class="lead">Material y tiempo son los que muestra tu laminador para <b>una placa</b>; las placas son el <b>total a imprimir para todo el pedido</b>.</p>' +
      '<div class="grid two" style="margin-bottom:14px">' + printer + '</div>' +
      '<div class="label" style="margin-bottom:8px">Material y peso por placa</div>' + lines +
      '<button type="button" class="btn small ghost" data-act="add-line">+ Agregar otro material</button>' +
      '<div class="grid" style="margin-top:16px">' +
      field({ path: 'job.hours', label: 'Tiempo · horas', suffix: 'h' }) +
      field({ path: 'job.minutes', label: 'Tiempo · minutos', suffix: 'min' }) +
      field({ path: 'job.plates', label: 'Placas totales del pedido', step: '1', min: 1, hint: 'Placas a imprimir para cubrir todo el pedido. Al cargar un archivo se llenan con las que trae; súbelas si el pedido repite placas.' }) +
      '</div></section>';

    // La relación entre placas y piezas la indica el usuario: el archivo del laminador sólo trae las placas.
    var relBlock = '<section class="card"><h2>Piezas y placas</h2>' +
      '<p class="lead">Las piezas del pedido se deducen de las placas: una pieza puede repartirse en varias placas, y una placa puede llevar varias piezas (por ejemplo, llaveros). Indica cuál es tu caso y por cuál unidad quieres cotizar.</p>' +
      '<div class="grid two">' +
      field({ path: 'job.rel', type: 'select', label: 'Relación entre placas y piezas', rerender: true, wide: true,
        options: [['multi', 'Cada placa lleva una o varias piezas'], ['split', 'Una pieza se reparte en varias placas']] }) +
      (job.rel === 'split'
        ? field({ path: 'job.ppl', label: 'Placas por pieza', step: 'any', min: 1, hint: 'Cuántas placas necesita una pieza. Ej. 3 si cada pieza ocupa 3 placas.' })
        : field({ path: 'job.ppp', label: 'Piezas por placa', step: '1', min: 1, hint: 'Ej. 12 si caben 12 llaveros en cada placa.' })) +
      field({ path: 'job.by', type: 'select', label: 'Cotizar por', options: [['piece', 'Pieza'], ['plate', 'Placa']],
        hint: 'Define el precio unitario y la cantidad con la que se aplica el descuento por volumen.' }) +
      '</div><div class="note info" data-live="qty" style="margin:14px 0 0"></div></section>';

    var extras = [];
    if (mods.design) extras.push(field({ path: 'job.designH', label: 'Diseño / modelado', suffix: 'h', hint: 'Horas de trabajo de diseño para este pedido.' }));
    if (mods.post) {
      extras.push(field({ path: 'job.postMin', label: 'Postprocesado por pieza', suffix: 'min', hint: 'Lijado, pintura, ensamblado, retirar soportes…' }));
      extras.push(field({ path: 'job.supplies', label: 'Insumos por pieza', prefix: code, hint: 'Lijas, pintura, tornillos, inserts…' }));
    }
    if (S.mode === 'taller' && S.cfg.modules.multicolor.on) {
      extras.push(field({ path: 'job.purgeG', label: 'Purga extra por placa', suffix: 'g', hint: 'Sólo lo que NO esté ya en el peso del laminador.' }));
      extras.push(field({ path: 'job.extraMin', label: 'Minutos extra por placa', suffix: 'min', hint: 'Cambios de color o de boquilla no incluidos en el tiempo.' }));
    }
    if (S.mode === 'taller') extras.push(field({ path: 'job.shipping', label: 'Envío que se cobra', prefix: code, hint: 'Se suma sin margen. Déjalo en 0 si no aplica.' }));
    var urgent = mods.rush ? '<div class="field wide">' + check({ path: 'job.urgent', label: 'Entrega urgente' + (S.mode === 'taller' ? ' (+' + fmtN(S.cfg.modules.rush.pct, 1) + ' %)' : (rates.tail.rushPct ? ' (+' + fmtN(rates.tail.rushPct, 1) + ' %)' : '')) }) + '</div>' : '';
    var more = (extras.length || urgent)
      ? '<section class="card"><h2>Trabajo adicional</h2><div class="grid">' + extras.join('') + urgent + '</div></section>' : '';

    var project = '<section class="card"><div class="card-head"><h2>Proyecto</h2>' +
      '<button type="button" class="btn small ' + (S.confirmNew ? 'danger' : 'ghost') + '" data-act="new-quote">' +
      (S.confirmNew ? '¿Borrar todo? Pulsa de nuevo' : 'Nueva cotización') + '</button></div><div class="grid two">' +
      field({ path: 'job.name', type: 'text', label: 'Nombre del proyecto', placeholder: 'Ej. Soporte para audífonos' }) +
      field({ path: 'job.client', type: 'text', label: 'Cliente', placeholder: 'Opcional' }) + '</div></section>';

    return project + '<section class="card"><h2>Archivo del laminador <span class="tag">opcional</span></h2>' +
      '<p class="lead">Carga el archivo y se llenan peso, tiempo y placas automáticamente.</p>' + importBox() + '</section>' + print + relBlock + more;
  }

  // ------------------------------------------------------------------
  // Vistas de resultado
  // ------------------------------------------------------------------
  function hasData() {
    var g = S.job.lines.reduce(function (s, l) { return s + (Number(l.g) || 0); }, 0);
    return g > 0 || (Number(S.job.hours) || 0) > 0 || (Number(S.job.minutes) || 0) > 0;
  }

  function notesHtml(notes) {
    return (notes || []).map(function (n) { return '<div class="note ' + n.level + '">' + esc(n.text) + '</div>'; }).join('');
  }

  function resultTaller(q, cfg) {
    var code = cfg.money.code;
    var m = function (x) { return money(x, code); };
    var taxOn = cfg.money.taxOn;
    var headLabel = taxOn ? 'Precio total con IVA' : 'Precio total';
    var subtotal = q.subtotal;
    var share = function (x) { return subtotal > 0 ? pct(x / subtotal) : '—'; };

    if (!hasData()) {
      return '<section class="card result"><div class="note empty">Captura el peso y el tiempo de impresión, o carga el archivo del laminador, para ver el precio.</div></section>';
    }

    var c = q.costs;
    var seg = [
      ['Material', c.material, 'var(--c-material)'],
      ['Máquina', c.depreciation + c.maintenance, 'var(--c-machine)'],
      ['Electricidad', c.electricity, 'var(--c-energy)'],
      ['Fallas', c.failure, 'var(--c-failure)'],
      ['Mano de obra', c.labor + c.design + c.postLabor, 'var(--c-labor)'],
      ['Insumos, empaque e indirectos', c.postSupplies + c.packaging + c.overhead, 'var(--c-other)'],
      ['Comisiones', q.fees, 'var(--c-fees)'],
      ['Envío', q.ship, 'var(--c-ship)'],
      ['Utilidad', Math.max(0, q.profit), 'var(--c-profit)']
    ].filter(function (s) { return s[1] > 0.004; });
    var segTotal = seg.reduce(function (s, x) { return s + x[1]; }, 0) || 1;
    var bar = '<div class="stack" role="img" aria-label="Composición del precio">' + seg.map(function (s) {
      return '<span style="width:' + (s[1] / segTotal * 100).toFixed(2) + '%;background:' + s[2] + '" title="' + esc(s[0]) + '"></span>';
    }).join('') + '</div>';
    var legend = '<div class="legend">' + seg.map(function (s) {
      return '<div><i style="background:' + s[2] + '"></i><em>' + esc(s[0]) + '</em><b>' + pct(s[1] / segTotal, 0) + '</b></div>';
    }).join('') + '</div>';

    var row = function (label, amount, opt) {
      opt = opt || {};
      return '<tr class="' + (opt.cls || '') + '"><td>' + label + (opt.hint ? '<small>' + opt.hint + '</small>' : '') + '</td><td>' + m(amount) + '</td><td>' + (opt.noShare ? '' : share(amount)) + '</td></tr>';
    };
    var minRow = q.service - (q.N + q.rush - q.discount) - q.fees;

    var tbl = '<table class="detail"><thead><tr><th>Concepto</th><th>Monto</th><th>% del subtotal</th></tr></thead><tbody>' +
      '<tr class="sec"><td colspan="3">Costos</td></tr>' +
      row('Material', c.material, { hint: fmtN(q.gramsBilled, 1) + ' g con merma (' + fmtN(q.gramsNet, 1) + ' g netos)' }) +
      row('Depreciación de la máquina', c.depreciation, { hint: duration(q.hours) + ' de impresión' }) +
      row('Mantenimiento y refacciones', c.maintenance) +
      row('Electricidad', c.electricity, { hint: fmtN(q.kwh, 2) + ' kWh' }) +
      row('Colchón por fallas (' + fmtN(cfg.risk.failPct, 1) + ' %)', c.failure, { hint: 'Se divide entre (1 − tasa de fallas)' }) +
      row('Mano de obra (preparación y manejo)', c.labor) +
      (cfg.modules.design.on ? row('Diseño y modelado', c.design) : '') +
      (cfg.modules.post.on ? row('Postprocesado (mano de obra)', c.postLabor) + row('Insumos de postprocesado', c.postSupplies) : '') +
      (cfg.modules.packaging.on ? row('Empaque', c.packaging) : '') +
      row('Gastos indirectos (' + fmtN(cfg.risk.overheadPct, 1) + ' %)', c.overhead) +
      row('Costo total', q.cost, { cls: 'total' }) +
      '<tr class="sec"><td colspan="3">Del costo al precio</td></tr>' +
      row(cfg.pricing.method === 'markup' ? 'Utilidad (multiplicador ×' + fmtN(cfg.pricing.markup, 2) + ')' : 'Utilidad (margen ' + fmtN(cfg.pricing.marginPct, 1) + ' %)', q.marginAmount) +
      (q.rush > 0.004 ? row('Recargo por urgencia', q.rush) : '') +
      (q.discount > 0.004 ? row('Descuento por volumen (' + fmtN(q.discountPct, 1) + ' %)', -q.discount, { hint: 'Por ' + fmtN(q.units) + ' ' + plural(q.units, unitWord(q), unitWord(q) + 's') }) : '') +
      (q.fees > 0.004 ? row('Comisiones y cargos de cobro', q.fees, { hint: 'Ya incluidas en el precio para que tu utilidad no baje' }) : '') +
      (Math.abs(minRow) > 0.004 && q.minApplied ? row('Ajuste a pedido mínimo', minRow) : '') +
      (q.ship > 0.004 ? row('Envío', q.ship, { hint: 'Sin margen' }) : '') +
      (Math.abs(q.roundAdj) > 0.004 ? row('Redondeo', q.roundAdj) : '') +
      row('Subtotal antes de IVA', q.subtotal, { cls: 'total' }) +
      (taxOn ? row('IVA (' + fmtN(cfg.money.taxRate, 1) + ' %)', q.tax, { noShare: true }) : '') +
      row(taxOn ? 'Total con IVA' : 'Total', q.total, { cls: 'total grand', noShare: true }) +
      '</tbody></table>';

    return '<section class="card result">' +
      '<div class="price-head"><div class="label">' + headLabel + '</div><div class="price">' + m(q.total) + '</div>' +
      '<div class="sub">' + (taxOn ? 'Antes de IVA ' + m(q.subtotal) + ' · ' : '') + qtyText(q) + ' · ' + m(q.unit) + ' por ' + unitWord(q) + ' (sin IVA)' +
      (differ(q) ? ' · equivale a ' + m(q.byPlate ? q.unitPiece : q.unitPlate) + ' por ' + (q.byPlate ? 'pieza' : 'placa') : '') + '</div></div>' +
      notesHtml(q.notes) +
      '<div class="kpis">' +
      '<div class="kpi"><div class="k">Costo total</div><div class="v">' + m(q.cost) + '</div></div>' +
      '<div class="kpi"><div class="k">Utilidad</div><div class="v ' + (q.profit < 0 ? 'bad' : 'good') + '">' + m(q.profit) + '</div></div>' +
      '<div class="kpi"><div class="k">Margen real</div><div class="v">' + pct(q.marginEff) + '</div></div>' +
      '<div class="kpi"><div class="k">Utilidad por hora de máquina</div><div class="v">' + m(q.profitPerHour) + '</div></div></div>' +
      '<div class="label">¿A dónde se va el precio?</div>' + bar + legend +
      '<details open><summary>Desglose detallado</summary>' + tbl + '</details>' +
      '<div class="btn-row"><button type="button" class="btn primary" data-act="copy-quote">Copiar cotización</button>' +
      '<button type="button" class="btn" data-act="print">Imprimir / guardar PDF</button>' +
      '<button type="button" class="btn" data-act="mode" data-mode="cliente">Ver como cliente</button></div>' +
      '<p class="sub" style="margin-top:10px">La cotización que copias o imprimes nunca incluye tus costos internos.</p></section>';
  }

  function resultClient(q, rates) {
    var code = rates.money.code;
    var m = function (x) { return money(x, code); };
    if (!hasData()) {
      return '<section class="card result"><div class="note empty">Captura el peso y el tiempo de impresión de tu pieza, o carga el archivo de tu laminador, para ver el precio estimado.</div></section>';
    }
    var taxOn = rates.money.taxOn;
    var lines = [];
    lines.push(['Piezas', fmtN(q.pieces)]);
    if (differ(q)) lines.push(['Placas de impresión', fmtN(q.plates)]);
    lines.push(['Precio por ' + unitWord(q) + (taxOn ? ' (sin IVA)' : ''), m(q.unit)]);
    if (q.discountPct > 0) lines.push(['Descuento por volumen incluido', fmtN(q.discountPct, 1) + ' %']);
    if (S.job.urgent && rates.mods.rush) lines.push(['Incluye recargo por entrega urgente', '+' + fmtN(rates.tail.rushPct, 1) + ' %']);
    if (q.ship > 0) lines.push(['Envío', m(q.ship)]);
    if (taxOn) {
      lines.push(['Subtotal', m(q.subtotal)]);
      lines.push(['IVA (' + fmtN(rates.money.taxRate, 1) + ' %)', m(q.tax)]);
    }
    lines.push(['Total', m(q.total)]);
    var foot = [];
    if (rates.biz.validityDays) foot.push('Vigencia de la cotización: ' + fmtN(rates.biz.validityDays) + ' días.');
    if (rates.biz.notes) foot.push(esc(rates.biz.notes));
    if (rates.biz.contact) foot.push('Contacto: ' + esc(rates.biz.contact));
    return '<section class="card result"><div class="price-head"><div class="label">Precio estimado' + (taxOn ? ' con IVA' : '') + '</div><div class="price">' + m(q.total) + '</div>' +
      '<div class="sub">' + qtyText(q) + '</div></div>' +
      notesHtml(q.notes) +
      (q.minApplied ? '<div class="note info">Se aplica el pedido mínimo del taller.</div>' : '') +
      '<div class="client-lines">' + lines.map(function (l) { return '<div><span>' + l[0] + '</span><span>' + l[1] + '</span></div>'; }).join('') + '</div>' +
      '<p class="sub" style="margin-top:12px">' + foot.join('<br>') + '</p>' +
      '<div class="btn-row"><button type="button" class="btn primary" data-act="copy-quote">Copiar cotización</button>' +
      '<button type="button" class="btn" data-act="print">Imprimir / guardar PDF</button></div></section>';
  }

  // Texto plano y hoja imprimible (siempre versión cliente)
  function customerData(q, biz, moneyCfg, mats) {
    var names = S.job.lines.filter(function (l) { return (Number(l.g) || 0) > 0; }).map(function (l) {
      var m = mats.filter(function (x) { return x.id === l.materialId; })[0];
      return m ? m.name : '';
    }).filter(Boolean);
    var uniq = names.filter(function (n, i) { return names.indexOf(n) === i; });
    return {
      biz: biz, money: moneyCfg, materials: uniq.join(', '), q: q,
      date: new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })
    };
  }

  function quoteText(d) {
    var m = function (x) { return money(x, d.money.code); };
    var q = d.q, j = S.job, out = [];
    out.push('COTIZACIÓN DE IMPRESIÓN 3D' + (d.biz.name ? ' — ' + d.biz.name : ''));
    out.push('Fecha: ' + d.date);
    if (j.name) out.push('Proyecto: ' + j.name);
    if (j.client) out.push('Cliente: ' + j.client);
    out.push('Piezas: ' + fmtN(q.pieces) + (differ(q) ? ' (en ' + fmtN(q.plates) + ' ' + plural(q.plates, 'placa', 'placas') + ')' : '') + (d.materials ? ' · Material: ' + d.materials : ''));
    out.push('Precio por ' + unitWord(q) + ': ' + m(q.unit) + (d.money.taxOn ? ' (sin IVA)' : ''));
    if (q.ship > 0) out.push('Envío: ' + m(q.ship));
    if (d.money.taxOn) { out.push('Subtotal: ' + m(q.subtotal)); out.push('IVA (' + fmtN(d.money.taxRate, 1) + ' %): ' + m(q.tax)); }
    out.push('TOTAL: ' + m(q.total));
    if (d.biz.validityDays) out.push('Vigencia: ' + fmtN(d.biz.validityDays) + ' días');
    if (d.biz.notes) out.push(d.biz.notes);
    if (d.biz.contact) out.push('Contacto: ' + d.biz.contact);
    return out.join('\n');
  }

  function sheetHtml(d) {
    var m = function (x) { return money(x, d.money.code); };
    var q = d.q, j = S.job;
    var importe = q.service + q.roundAdj;
    var foot = [];
    if (d.biz.validityDays) foot.push('Vigencia de la cotización: ' + fmtN(d.biz.validityDays) + ' días.');
    if (d.biz.notes) foot.push(d.biz.notes);
    return '<div class="sheet"><h1>Cotización</h1><div>' + esc(d.biz.name || '') + '</div>' +
      '<div class="meta"><div><b>Proyecto:</b> ' + esc(j.name || '—') + '<br><b>Cliente:</b> ' + esc(j.client || '—') + '</div>' +
      '<div style="text-align:right"><b>Fecha:</b> ' + esc(d.date) + '<br>' + esc(d.biz.contact || '') + '</div></div>' +
      '<table><thead><tr><th>Concepto</th><th>Cant.</th><th>P. unitario</th><th>Importe</th></tr></thead><tbody>' +
      '<tr><td>Impresión 3D' + (d.materials ? ' · ' + esc(d.materials) : '') +
      '<span style="display:block;color:#555;font-size:12px">' + esc(qtyText(q)) + ' · precio por ' + unitWord(q) + '</span></td><td>' + fmtN(q.units) + '</td><td>' + m(q.unit) + '</td><td>' + m(importe) + '</td></tr>' +
      (q.ship > 0 ? '<tr><td>Envío</td><td>1</td><td>' + m(q.ship) + '</td><td>' + m(q.ship) + '</td></tr>' : '') +
      '</tbody><tfoot>' +
      (d.money.taxOn ? '<tr><td colspan="3" style="text-align:right">Subtotal</td><td>' + m(q.subtotal) + '</td></tr><tr><td colspan="3" style="text-align:right">IVA (' + fmtN(d.money.taxRate, 1) + ' %)</td><td>' + m(q.tax) + '</td></tr>' : '') +
      '<tr class="grand"><td colspan="3" style="text-align:right">Total</td><td>' + m(q.total) + '</td></tr></tfoot></table>' +
      '<div class="foot">' + esc(foot.join('\n')) + '</div></div>';
  }

  // ------------------------------------------------------------------
  // Pestaña "Configuración del taller"
  // ------------------------------------------------------------------
  function configView(extra) {
    var cfg = S.cfg;
    var code = cfg.money.code;
    var cur = code;

    var biz = '<section class="card"><h2>Tu negocio y moneda</h2><p class="lead">Estos datos aparecen en la cotización que compartes con tus clientes.</p><div class="grid two">' +
      field({ path: 'cfg.biz.name', type: 'text', label: 'Nombre del negocio', placeholder: 'Ej. Taller 3D Norte' }) +
      field({ path: 'cfg.biz.contact', type: 'text', label: 'Contacto', placeholder: 'WhatsApp, correo o sitio web' }) +
      field({ path: 'cfg.biz.notes', type: 'textarea', label: 'Notas al pie de la cotización', wide: true }) +
      '</div><div class="grid" style="margin-top:14px">' +
      field({ path: 'cfg.money.code', type: 'select', label: 'Moneda', options: Defaults.CURRENCIES, rerender: true }) +
      field({ path: 'cfg.money.taxRate', label: 'IVA / impuesto', suffix: '%', hint: 'En México el IVA general es 16 %.' }) +
      field({ path: 'cfg.money.rounding', type: 'select-num', label: 'Redondear precio hacia arriba a', options: [[0, 'Sin redondeo'], [1, '1'], [5, '5'], [10, '10'], [50, '50']] }) +
      field({ path: 'cfg.biz.validityDays', label: 'Vigencia de la cotización', suffix: 'días' }) +
      '<div class="field wide">' + check({ path: 'cfg.money.taxOn', label: 'Sumar y mostrar el IVA en la cotización', rerender: false }) + '</div></div></section>';

    var printers = '<section class="card"><h2>Impresoras</h2><p class="lead">El costo por hora de cada máquina sale de su precio, vida útil, mantenimiento y consumo eléctrico.</p>' +
      cfg.printers.map(function (p, i) {
        var b = 'cfg.printers.' + i;
        return '<div class="item"><div class="item-head">' + field({ path: b + '.name', type: 'text', label: 'Nombre de la impresora' }) +
          (cfg.printers.length > 1 ? '<button type="button" class="icon-btn" data-act="rm-printer" data-i="' + i + '" aria-label="Eliminar impresora">×</button>' : '') + '</div>' +
          '<div class="grid">' +
          field({ path: b + '.price', label: 'Precio de compra', prefix: cur }) +
          field({ path: b + '.lifeH', label: 'Vida útil estimada', suffix: 'h', hint: 'Horas de impresión antes de reemplazarla. 3,000–5,000 h es habitual.' }) +
          field({ path: b + '.salvagePct', label: 'Valor de rescate', suffix: '%', hint: 'Lo que crees recuperar al venderla.' }) +
          field({ path: b + '.powerW', label: 'Consumo promedio', suffix: 'W', hint: 'Promedio durante la impresión, no el pico. Mídelo con un wattmetro.' }) +
          field({ path: b + '.maintPerH', label: 'Mantenimiento y refacciones', prefix: cur, suffix: '/h', hint: 'Boquillas, placas, correas, lubricante, PTFE…' }) +
          '</div><small data-live="printer-h" data-i="' + i + '" style="display:block;margin-top:10px;color:var(--muted)"></small></div>';
      }).join('') +
      '<div class="btn-row"><button type="button" class="btn small" data-act="add-printer">+ Agregar impresora</button></div></section>';

    var mats = '<section class="card"><h2>Materiales</h2><p class="lead">Precio del carrete completo; el costo por gramo se calcula solo.</p>' +
      cfg.materials.map(function (mt, i) {
        var b = 'cfg.materials.' + i;
        return '<div class="item"><div class="item-head">' + field({ path: b + '.name', type: 'text', label: 'Material' }) +
          (cfg.materials.length > 1 ? '<button type="button" class="icon-btn" data-act="rm-material" data-i="' + i + '" aria-label="Eliminar material">×</button>' : '') + '</div>' +
          '<div class="grid">' + field({ path: b + '.spoolPrice', label: 'Precio del carrete', prefix: cur }) +
          field({ path: b + '.spoolG', label: 'Peso del carrete', suffix: 'g', hint: '' }) + '</div>' +
          '<small data-live="mat-pg" data-i="' + i + '" style="display:block;margin-top:10px;color:var(--muted)"></small></div>';
      }).join('') +
      '<div class="btn-row"><button type="button" class="btn small" data-act="add-material">+ Agregar material</button></div></section>';

    var base = '<section class="card"><h2>Energía, mano de obra y riesgos</h2><div class="grid">' +
      field({ path: 'cfg.energy.pricePerKwh', label: 'Precio de la electricidad', prefix: cur, suffix: '/kWh', hint: 'Revisa tu recibo. Ejemplo CFE doméstica 1 (2026): 1.125 básico, 1.369 intermedio, 4.004 excedente.' }) +
      field({ path: 'cfg.labor.rate', label: 'Tarifa de mano de obra', prefix: cur, suffix: '/h', hint: 'Tu tiempo es un costo, no utilidad.' }) +
      field({ path: 'cfg.labor.prepMin', label: 'Preparación por pedido', suffix: 'min', hint: 'Revisar archivo, laminar, cotizar y atender al cliente.' }) +
      field({ path: 'cfg.labor.plateMin', label: 'Manejo por placa', suffix: 'min', hint: 'Iniciar, retirar pieza, limpiar y preparar la cama.' }) +
      field({ path: 'cfg.risk.failPct', label: 'Tasa de fallas', suffix: '%', hint: 'Impresiones que se pierden. Se divide entre (1 − tasa); no se suma.' }) +
      field({ path: 'cfg.risk.wastePct', label: 'Merma de material', suffix: '%', hint: 'Skirt, soportes, pruebas. Bambu Studio ya incluye purga y torre en el peso.' }) +
      field({ path: 'cfg.risk.overheadPct', label: 'Gastos indirectos', suffix: '%', hint: 'Renta, internet, software, herramientas.' }) +
      '</div></section>';

    var pr = cfg.pricing;
    var pricing = '<section class="card"><h2>Precio y utilidad</h2><div class="grid">' +
      field({ path: 'cfg.pricing.method', type: 'select', label: 'Método', options: [['margin', 'Margen sobre el precio'], ['markup', 'Multiplicador sobre el costo']], rerender: true }) +
      (pr.method === 'markup'
        ? field({ path: 'cfg.pricing.markup', label: 'Multiplicador', prefix: '×', step: '0.05', hint: 'Típico: 2× producción en serie, 2.5–3× piezas únicas.' })
        : field({ path: 'cfg.pricing.marginPct', label: 'Margen deseado', suffix: '%', hint: 'Utilidad ÷ precio. Sumar 30 % al costo NO es un margen de 30 %.' })) +
      '</div><small data-live="equiv" style="display:block;margin-top:10px;color:var(--muted)"></small></section>';

    var M = cfg.modules;
    var modCard = function (key, title, desc, body) {
      var on = M[key].on;
      return '<div class="module' + (on ? ' on' : '') + '"><label class="check"><input type="checkbox" data-path="cfg.modules.' + key + '.on" data-type="check" data-rerender id="' + idFor('cfg.modules.' + key + '.on') + '"' + (on ? ' checked' : '') + '> <span>' + title + '</span></label>' +
        '<div class="desc">' + desc + '</div>' + (on && body ? '<div class="grid">' + body + '</div>' : '') + '</div>';
    };
    var tiers = '';
    if (M.discounts.on) {
      tiers = '<div class="field wide"><div class="label">Descuentos por cantidad</div>' +
        '<small style="color:var(--muted)">La cantidad cuenta piezas o placas, según lo que se elija en «Cotizar por» al hacer la cotización.</small>' +
        M.discounts.tiers.map(function (t, i) {
          var b = 'cfg.modules.discounts.tiers.' + i;
          return '<div class="tier">' + field({ path: b + '.min', label: 'Desde (cantidad)', step: '1', min: 1 }) + field({ path: b + '.pct', label: 'Descuento', suffix: '%' }) +
            '<button type="button" class="icon-btn" data-act="rm-tier" data-i="' + i + '" aria-label="Quitar nivel" style="margin-top:20px">×</button></div>';
        }).join('') + '<div class="btn-row"><button type="button" class="btn small ghost" data-act="add-tier">+ Agregar nivel</button></div></div>';
    }
    var modules = '<section class="card"><h2>Módulos opcionales</h2><p class="lead">Activa sólo lo que uses; cada módulo agrega campos a la cotización.</p>' +
      modCard('design', 'Diseño y modelado 3D', 'Cobra las horas de modelado o preparación de archivos.', field({ path: 'cfg.modules.design.rate', label: 'Tarifa de diseño', prefix: cur, suffix: '/h' })) +
      modCard('post', 'Postprocesado', 'Lijado, pintura, ensamblado e insumos por pieza.', field({ path: 'cfg.modules.post.rate', label: 'Tarifa de postprocesado', prefix: cur, suffix: '/h' })) +
      modCard('multicolor', 'Multicolor y purga (AMS / cambio de boquilla)', 'Agrega campos para purga y tiempo extra que no estén ya en el laminado.', '') +
      modCard('packaging', 'Empaque', 'Caja, relleno y etiquetas por pedido.', field({ path: 'cfg.modules.packaging.perOrder', label: 'Costo de empaque por pedido', prefix: cur })) +
      modCard('fees', 'Comisiones de plataforma o cobro', 'Se suman al precio para que, tras pagarlas, tu utilidad no baje.',
        field({ path: 'cfg.modules.fees.pct', label: 'Comisión', suffix: '%' }) + field({ path: 'cfg.modules.fees.fixed', label: 'Cargo fijo por venta', prefix: cur })) +
      modCard('minimum', 'Pedido mínimo', 'Cubre el trabajo fijo de laminar, preparar y empacar piezas pequeñas.', field({ path: 'cfg.modules.minimum.amount', label: 'Monto mínimo (antes de IVA)', prefix: cur })) +
      modCard('rush', 'Recargo por urgencia', 'Casilla “entrega urgente” en la cotización.', field({ path: 'cfg.modules.rush.pct', label: 'Recargo', suffix: '%' })) +
      modCard('discounts', 'Descuento por volumen', 'Reduce el precio según la cantidad del pedido, en piezas o en placas (según por cuál unidad cotices).', tiers) + '</section>';

    var link = extra.link
      ? '<div class="linkbox"><input readonly id="link-out" value="' + esc(extra.link) + '" aria-label="Enlace para clientes"><button type="button" class="btn primary" data-act="copy-link">Copiar</button></div>' +
        '<small style="display:block;margin-top:6px;color:var(--muted)">' + extra.link.length + ' caracteres.' + (location.protocol === 'file:' ? ' Estás usando el archivo local: para que tus clientes abran el enlace, publica el sitio (por ejemplo con GitHub Pages) y genera el enlace desde esa dirección.' : '') + '</small>'
      : '';
    var share = '<section class="card"><h2>Compartir con clientes</h2>' +
      '<p class="lead">Genera un enlace del cotizador en modo Cliente. Lleva <b>sólo tus tarifas de venta</b> (precio por gramo, por hora, mínimo, descuentos e IVA); nunca tus costos, márgenes ni utilidad. Cualquiera con el enlace puede ver esas tarifas.</p>' +
      '<div class="btn-row" style="margin-top:0"><button type="button" class="btn primary" data-act="gen-link">Generar enlace para clientes</button>' +
      '<button type="button" class="btn" data-act="mode" data-mode="cliente">Vista previa como cliente</button></div>' + link + '</section>';

    var backup = '<section class="card"><h2>Respaldo y restablecer</h2><p class="lead">Tu configuración se guarda sólo en este navegador. Exporta un respaldo para llevarla a otro equipo.</p>' +
      '<div class="btn-row" style="margin-top:0"><button type="button" class="btn" data-act="export-cfg">Exportar configuración</button>' +
      '<label class="btn">Importar configuración<input type="file" accept="application/json,.json" data-act="import-cfg" class="sr-only"></label>' +
      '<button type="button" class="btn danger" data-act="reset">' + (extra.confirmReset ? '¿Seguro? Pulsa de nuevo para restablecer' : 'Restablecer valores de ejemplo') + '</button></div></section>';

    return '<div class="prose" style="max-width:none"><div class="banner" style="background:var(--warn-soft);color:var(--warn)">Todos los valores iniciales son ejemplos. Reemplázalos con los de tu taller para que la cotización refleje tus costos reales.</div></div>' +
      '<div class="grid two" style="align-items:start"><div>' + biz + printers + mats + '</div><div>' + base + pricing + modules + share + backup + '</div></div>';
  }

  // ------------------------------------------------------------------
  // Pestaña "Metodología"
  // ------------------------------------------------------------------
  function methodView() {
    return '<article class="prose">' +
      '<h2>Cómo se calcula el precio</h2>' +
      '<p>El cotizador sigue la estructura que coinciden en recomendar las guías de precios de impresión 3D: se calcula el <b>costo real</b> del trabajo y sobre él se aplica un margen. Todos los parámetros son editables en <i>Configuración del taller</i>.</p>' +
      '<h3>1. Costo de producción</h3>' +
      '<pre>Material     = Σ gramos × (1 + merma) × precio_por_gramo\n' +
      'Máquina      = horas × [ precio × (1 − rescate) / vida_útil + mantenimiento_por_hora ]\n' +
      'Electricidad = horas × (watts / 1000) × precio_kWh\n' +
      'Producción   = Material + Máquina + Electricidad\n' +
      'Con fallas   = Producción / (1 − tasa_de_fallas)</pre>' +
      '<p>Las fallas se dividen entre (1 − tasa) y no se suman como porcentaje: con 10 % de impresiones perdidas el costo sube 11.1 %, no 10 %. El colchón se aplica a lo que se desperdicia en una falla (material, máquina y energía).</p>' +
      '<h3>2. Costo total</h3>' +
      '<pre>Mano de obra = (minutos_preparación + minutos_por_placa × placas) / 60 × tarifa\n' +
      'Costo        = Con fallas + Mano de obra + Diseño + Postprocesado + Insumos + Empaque\n' +
      '               + Indirectos% × (todo lo anterior)</pre>' +
      '<h3>3. Del costo al precio</h3>' +
      '<pre>Precio base N = Costo / (1 − margen)          (método “margen”)\n' +
      'Precio base N = Costo × multiplicador          (método “multiplicador”)\n' +
      'Urgencia      → N × (1 + recargo)\n' +
      'Descuento     → según la cantidad del pedido (piezas o placas)\n' +
      'Comisión      → Precio = (N + cargo_fijo) / (1 − comisión%)\n' +
      'Mínimo        → si Precio &lt; mínimo, se cobra el mínimo\n' +
      'Envío         → se suma sin margen\n' +
      'Redondeo      → hacia arriba al múltiplo elegido\n' +
      'IVA           → subtotal × tasa</pre>' +
      '<p><b>Margen no es lo mismo que sobreprecio.</b> Un margen del 40 % significa que la utilidad es el 40 % del precio (equivale a multiplicar el costo por 1.67). Sumar 30 % al costo produce sólo 23 % de margen.</p>' +
      '<p>La comisión se calcula “hacia atrás” (gross-up) para que, después de pagarla, te quede el precio base: así una comisión no se come tu utilidad.</p>' +
      '<h3>Modo Taller y modo Cliente</h3>' +
      '<p>El precio del modo Cliente sale de <b>tarifas de venta</b> derivadas de tu configuración (precio por gramo de cada material, por hora de cada impresora, por placa y por pedido). Como el modelo es lineal, esas tarifas reproducen exactamente el mismo precio que el modo Taller, sin revelar costos, márgenes ni utilidad.</p>' +
      '<h3>Piezas y placas</h3>' +
      '<p>Una pieza puede repartirse en varias placas y una placa puede llevar varias piezas. El costo físico (material, tiempo de máquina, electricidad, fallas y manejo por placa) depende de las <b>placas</b>; el postprocesado y sus insumos dependen de las <b>piezas</b>. El archivo del laminador sólo trae las placas, así que tú indicas la relación:</p>' +
      '<pre>Varias piezas por placa      →  piezas = placas × piezas_por_placa\n' +
      'Una pieza en varias placas   →  piezas = placas ÷ placas_por_pieza</pre>' +
      '<p><b>Cotizar por</b> pieza o por placa define el precio unitario que se muestra y la cantidad con la que se cuenta el descuento por volumen. El costo del trabajo es el mismo; el total sólo cambia si esa cantidad hace que el descuento cambie de nivel.</p>' +
      '<h3>Datos de tu archivo</h3>' +
      '<p>Al cargar un <code>.gcode.3mf</code> se lee el archivo <code>Metadata/slice_info.config</code> (tiempo estimado y gramos por filamento de cada placa). Con varias placas puedes usar una sola o el conjunto. El peso del laminador ya incluye torre de purga y flush, por eso la merma por defecto es baja.</p>' +
      '<h3>Fuentes consultadas</h3>' +
      '<ul>' +
      '<li><a href="https://filaquote.com/guides/how-much-to-charge-for-3d-printing/" target="_blank" rel="noopener">FilaQuote — Cuánto cobrar por impresión 3D (2026)</a></li>' +
      '<li><a href="https://siraya.tech/blogs/news/how-to-price-3d-prints" target="_blank" rel="noopener">Siraya Tech — Fórmula de precios rentable</a></li>' +
      '<li><a href="https://mandarin3d.com/blog/how-to-price-3d-printing-jobs" target="_blank" rel="noopener">Mandarin3D — Costos ocultos al cotizar</a></li>' +
      '<li><a href="https://3dpcc.news/3d-printing-cost-formula" target="_blank" rel="noopener">3DPCC — Fórmula del costo de impresión 3D</a></li>' +
      '<li><a href="https://www.unotv.com/nacional/las-tarifas-domesticas-de-cfe-van-de-1-a-4-pesos-por-kwh-en-junio-de-2026/" target="_blank" rel="noopener">UnoTV — Tarifas domésticas CFE, junio 2026</a></li>' +
      '</ul>' +
      '<p style="color:var(--muted)">Este cotizador da una estimación. Los valores iniciales son ejemplos: ajústalos a tus propios costos. No constituye asesoría fiscal ni contable.</p>' +
      '</article>';
  }

  root.UI = {
    bind: bind, esc: esc, getPath: getPath, setPath: setPath, money: money, fmtN: fmtN, pct: pct, duration: duration,
    plural: plural, qtyText: qtyText, qtyLive: qtyLive,
    catalog: catalog, curCode: curCode, header: header, tabs: tabs, jobForm: jobForm, hasData: hasData,
    resultTaller: resultTaller, resultClient: resultClient, customerData: customerData, quoteText: quoteText,
    sheetHtml: sheetHtml, configView: configView, methodView: methodView, idFor: idFor
  };
})(typeof self !== 'undefined' ? self : this);
