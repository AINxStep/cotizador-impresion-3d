/* app.js — estado, eventos y orquestación de la interfaz. */
(function () {
  'use strict';

  var Calc = window.Calc, Importers = window.Importers, Defaults = window.Defaults, UI = window.UI;
  var LS_CFG = 'cot3d.cfg.v1';
  var LS_JOB = 'cot3d.job.v1';

  // ------------------------------------------------------------------
  // Persistencia
  // ------------------------------------------------------------------
  function loadJSON(key) {
    try { var s = window.localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function saveJSON(key, val) {
    try { window.localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* almacenamiento no disponible */ }
  }
  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function deepMerge(base, over) {
    if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = deepMerge(base[k], over[k]); });
    Object.keys(over).forEach(function (k) { if (!(k in out)) out[k] = over[k]; });
    return out;
  }

  // ------------------------------------------------------------------
  // Enlace para clientes (#c=<tarifas en base64url>)
  // ------------------------------------------------------------------
  function b64urlEncode(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function validRates(r) {
    return r && r.v === 1 && isObj(r.base) && Array.isArray(r.mats) && r.mats.length && Array.isArray(r.machines) &&
      r.machines.length && isObj(r.mods) && isObj(r.tail) && isObj(r.money) && isObj(r.biz);
  }
  function ratesFromHash() {
    var m = /^#c=([\w-]+)$/.exec(window.location.hash || '');
    if (!m) return null;
    try {
      var r = JSON.parse(b64urlDecode(m[1]));
      return validRates(r) ? r : null;
    } catch (e) { return null; }
  }
  function buildLink() {
    var code = b64urlEncode(JSON.stringify(Calc.deriveRates(S.cfg)));
    return window.location.href.split('#')[0] + '#c=' + code;
  }

  // ------------------------------------------------------------------
  // Estado
  // ------------------------------------------------------------------
  var S = {
    cfg: null, job: null, mode: 'taller', tab: 'cotizar', fromLink: false,
    linkRates: null, imp: null, link: '', confirmReset: false
  };
  UI.bind(S);

  function initState() {
    var linkRates = ratesFromHash();
    if (linkRates) {
      S.fromLink = true;
      S.mode = 'cliente';
      S.linkRates = linkRates;
      S.cfg = Defaults.makeConfig(); // sin uso en este modo; evita nulos
      S.job = {
        name: '', client: '', printerId: linkRates.machines[0].id,
        lines: [{ materialId: linkRates.mats[0].id, g: 0 }], hours: 0, minutes: 0, plates: 1, ppp: 1,
        designH: 0, postMin: 0, supplies: 0, purgeG: 0, extraMin: 0, urgent: false, shipping: 0
      };
      return;
    }
    S.cfg = deepMerge(Defaults.makeConfig(), loadJSON(LS_CFG) || {});
    // los arreglos guardados reemplazan a los de ejemplo (deepMerge sólo mezcla objetos)
    var saved = loadJSON(LS_CFG);
    if (saved) ['printers', 'materials'].forEach(function (k) { if (Array.isArray(saved[k]) && saved[k].length) S.cfg[k] = saved[k]; });
    if (saved && saved.modules && saved.modules.discounts && Array.isArray(saved.modules.discounts.tiers)) {
      S.cfg.modules.discounts.tiers = saved.modules.discounts.tiers;
    }
    S.job = deepMerge(Defaults.makeJob(S.cfg), loadJSON(LS_JOB) || {});
    var savedJob = loadJSON(LS_JOB);
    if (savedJob && Array.isArray(savedJob.lines) && savedJob.lines.length) S.job.lines = savedJob.lines;
  }

  var saveTimer = null;
  function persist() {
    if (S.fromLink) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveJSON(LS_CFG, S.cfg); saveJSON(LS_JOB, S.job); }, 250);
  }

  /** Tarifas activas: las del enlace, o las derivadas de la config (vista previa). */
  function activeRates() {
    if (S.fromLink) return S.linkRates;
    return S.mode === 'cliente' ? Calc.deriveRates(S.cfg) : null;
  }

  /** Mantiene consistentes las referencias del trabajo con el catálogo vigente. */
  function fixJob() {
    var cat = UI.catalog(activeRates());
    var okMat = function (id) { return cat.mats.some(function (m) { return m.id === id; }); };
    if (!cat.printers.some(function (p) { return p.id === S.job.printerId; })) S.job.printerId = cat.printers[0].id;
    if (!Array.isArray(S.job.lines) || !S.job.lines.length) S.job.lines = [{ materialId: cat.mats[0].id, g: 0 }];
    S.job.lines.forEach(function (l) { if (!okMat(l.materialId)) l.materialId = cat.mats[0].id; });
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  function $(sel) { return document.querySelector(sel); }

  function tabContent(rates) {
    if (S.mode === 'taller' && S.tab === 'config') return UI.configView({ link: S.link, confirmReset: S.confirmReset });
    if (S.mode === 'taller' && S.tab === 'metodo') return UI.methodView();
    var banner = (!S.fromLink && S.mode === 'cliente')
      ? '<div class="banner"><span>Vista previa: así verán la cotización tus clientes. No se muestra ningún costo interno.</span><button type="button" data-act="mode" data-mode="taller">Volver al taller</button></div>' : '';
    return banner + '<div class="layout"><div class="col-form">' + UI.jobForm(rates) + '</div>' +
      '<aside class="col-result" aria-label="Resultado"><div id="results"></div></aside></div>' +
      '<div class="mobile-total" id="mobile-total"><div><div class="mt">Total</div><div class="mv" id="mobile-total-v">—</div></div>' +
      '<a class="btn primary" href="#results" data-act="goto-results">Ver desglose</a></div>';
  }

  var rendering = false; // ignora eventos "change" que el navegador dispara al retirar un campo enfocado
  function renderApp() {
    var active = document.activeElement && document.activeElement.id;
    var y = window.scrollY;
    fixJob();
    var rates = activeRates();
    rendering = true;
    try {
      $('#app').innerHTML = UI.header(rates) + UI.tabs() + '<main><div class="wrap">' + tabContent(rates) + '</div></main>';
    } finally { rendering = false; }
    refresh(true);
    window.scrollTo(0, y);
    if (active) { var el = document.getElementById(active); if (el && el.focus) { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } } }
  }

  var lastView = null;
  function compute() {
    var rates = activeRates();
    if (S.mode === 'cliente') {
      var q = Calc.quoteFromRates(rates, S.job);
      return { q: q, rates: rates, biz: rates.biz, money: rates.money, mats: rates.mats };
    }
    var qt = Calc.computeQuote(S.cfg, S.job);
    return { q: qt, rates: null, biz: S.cfg.biz, money: S.cfg.money, mats: S.cfg.materials };
  }

  /** Recalcula resultados y textos “vivos” sin volver a dibujar los formularios. */
  function refresh(skipPersist) {
    if (!skipPersist) persist();
    lastView = compute();
    var v = lastView;
    var box = $('#results');
    if (box) {
      box.innerHTML = S.mode === 'cliente' ? UI.resultClient(v.q, v.rates) : UI.resultTaller(v.q, S.cfg);
      var mv = $('#mobile-total-v');
      if (mv) mv.textContent = UI.hasData() ? UI.money(v.q.total, v.money.code) : '—';
    }
    $('#sheet').innerHTML = UI.hasData() ? UI.sheetHtml(UI.customerData(v.q, v.biz, v.money, v.mats)) : '';
    updateLive();
  }

  function updateLive() {
    var cfg = S.cfg, code = cfg.money.code;
    document.querySelectorAll('[data-live]').forEach(function (el) {
      var kind = el.getAttribute('data-live'), i = Number(el.getAttribute('data-i'));
      if (kind === 'mat-pg') {
        var mt = cfg.materials[i];
        if (mt) el.textContent = 'Costo: ' + UI.money(Calc.costPerGram(mt), code) + ' por gramo';
      } else if (kind === 'printer-h') {
        var p = cfg.printers[i];
        if (p) {
          var dep = p.lifeH > 0 ? p.price * (1 - Math.min(100, Math.max(0, p.salvagePct)) / 100) / p.lifeH : 0;
          var elec = p.powerW / 1000 * cfg.energy.pricePerKwh;
          el.textContent = 'Costo de máquina ≈ ' + UI.money(dep + p.maintPerH + elec, code) + ' por hora (depreciación ' + UI.money(dep, code) + ' + mantenimiento ' + UI.money(p.maintPerH, code) + ' + electricidad ' + UI.money(elec, code) + ').';
        }
      } else if (kind === 'equiv') {
        var pr = cfg.pricing;
        if (pr.method === 'markup') {
          var k = Number(pr.markup) || 0;
          el.textContent = k > 0 ? 'Un multiplicador de ×' + UI.fmtN(k, 2) + ' equivale a un margen de ' + UI.fmtN((1 - 1 / k) * 100, 1) + ' % sobre el precio.' : '';
        } else {
          var m = Math.min(95, Number(pr.marginPct) || 0) / 100;
          el.textContent = 'Un margen de ' + UI.fmtN(m * 100, 1) + ' % equivale a multiplicar el costo por ×' + UI.fmtN(1 / (1 - m), 2) + '.';
        }
      }
    });
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  function copyText(text, okMsg) {
    var done = function () { toast(okMsg || 'Copiado al portapapeles'); };
    var fallback = function () {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('No se pudo copiar. Selecciónalo y cópialo manualmente.'); }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  // ------------------------------------------------------------------
  // Importación de archivos del laminador
  // ------------------------------------------------------------------
  function matchMaterial(type, mats) {
    var t = (type || '').toLowerCase().trim();
    if (!t) return null;
    var exact = mats.filter(function (m) { return m.name.toLowerCase().trim() === t; })[0];
    if (exact) return exact;
    var sorted = mats.slice().sort(function (a, b) { return b.name.length - a.name.length; });
    return sorted.filter(function (m) { var n = m.name.toLowerCase(); return n && (t.indexOf(n) >= 0 || n.indexOf(t) >= 0); })[0] || null;
  }

  function applyImport() {
    var imp = S.imp;
    var per = Importers.toPerPlate(imp.res, imp.which);
    var cat = UI.catalog(activeRates());
    var lines = [], mapping = [];
    per.filaments.forEach(function (f) {
      var mat = matchMaterial(f.type, cat.mats);
      var target = mat || cat.mats[0];
      var g = Math.round(f.grams * 100) / 100;
      var existing = lines.filter(function (l) { return l.materialId === target.id; })[0];
      if (existing) existing.g = Math.round((existing.g + g) * 100) / 100;
      else lines.push({ materialId: target.id, g: g });
      var label = (f.type || 'Filamento') + ' → ' + target.name + (mat ? '' : ' (sin coincidencia)');
      if (mapping.indexOf(label) < 0) mapping.push(label);
    });
    if (!lines.length) lines.push({ materialId: cat.mats[0].id, g: 0 });
    S.job.lines = lines;
    S.job.hours = per.hours;
    S.job.minutes = per.minutes;
    S.job.plates = per.plates;
    imp.mapping = mapping;
    if (!S.job.name && imp.name) S.job.name = imp.name.replace(/\.(gcode\.3mf|3mf|gcode|gco|g)$/i, '');
  }

  function handleFile(file) {
    if (!file) return;
    Importers.importFile(file).then(function (res) {
      S.imp = { res: res, name: file.name, which: 'all', mapping: [] };
      applyImport();
      renderApp();
      persist();
      toast('Archivo leído: ' + res.plates.length + ' placa' + (res.plates.length === 1 ? '' : 's'));
    }).catch(function (err) {
      S.imp = { error: err && err.message ? err.message : 'No se pudo leer el archivo.' };
      renderApp();
    });
  }

  // ------------------------------------------------------------------
  // Eventos
  // ------------------------------------------------------------------
  function onInput(e) {
    if (rendering) return;
    var t = e.target;
    var path = t.getAttribute && t.getAttribute('data-path');
    if (!path) return;
    var type = t.getAttribute('data-type'), v;
    if (type === 'number' || type === 'select-num') {
      if (t.value === '') v = 0;
      else { v = Number(t.value); if (!isFinite(v)) return; }
    } else if (type === 'check') v = t.checked;
    else v = t.value;
    UI.setPath(S, path, v);
    S.confirmReset = false;
    if (t.hasAttribute('data-rerender') && e.type === 'change') { persist(); renderApp(); }
    else if (t.tagName === 'SELECT' && path.indexOf('cfg.') === 0 && /materials|printers/.test(path)) { refresh(); }
    else refresh();
  }

  function onClick(e) {
    var el = e.target.closest && e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    var i = Number(el.getAttribute('data-i'));
    switch (act) {
      case 'mode':
        if (S.fromLink) return;
        S.mode = el.getAttribute('data-mode');
        if (S.mode === 'cliente') S.tab = 'cotizar';
        renderApp(); window.scrollTo(0, 0);
        break;
      case 'tab':
        S.tab = el.getAttribute('data-tab'); S.confirmReset = false; renderApp(); window.scrollTo(0, 0);
        break;
      case 'add-line': {
        var cat = UI.catalog(activeRates());
        S.job.lines.push({ materialId: cat.mats[0].id, g: 0 }); renderApp(); persist();
        break;
      }
      case 'rm-line': S.job.lines.splice(i, 1); renderApp(); persist(); break;
      case 'add-printer':
        S.cfg.printers.push({ id: Defaults.uid('p'), name: 'Nueva impresora', price: 10000, lifeH: 4000, salvagePct: 10, powerW: 150, maintPerH: 1 });
        renderApp(); persist(); break;
      case 'rm-printer': if (S.cfg.printers.length > 1) { S.cfg.printers.splice(i, 1); renderApp(); persist(); } break;
      case 'add-material':
        S.cfg.materials.push({ id: Defaults.uid('m'), name: 'Nuevo material', spoolPrice: 500, spoolG: 1000 }); renderApp(); persist(); break;
      case 'rm-material': if (S.cfg.materials.length > 1) { S.cfg.materials.splice(i, 1); renderApp(); persist(); } break;
      case 'add-tier': S.cfg.modules.discounts.tiers.push({ min: 50, pct: 20 }); renderApp(); persist(); break;
      case 'rm-tier': S.cfg.modules.discounts.tiers.splice(i, 1); renderApp(); persist(); break;
      case 'copy-quote':
        if (lastView) copyText(UI.quoteText(UI.customerData(lastView.q, lastView.biz, lastView.money, lastView.mats)), 'Cotización copiada');
        break;
      case 'print': window.print(); break;
      case 'gen-link': S.link = buildLink(); renderApp(); toast('Enlace generado'); break;
      case 'copy-link': copyText(S.link, 'Enlace copiado'); break;
      case 'export-cfg': {
        var blob = new Blob([JSON.stringify(S.cfg, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'cotizador-3d-configuracion.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        break;
      }
      case 'reset':
        if (!S.confirmReset) { S.confirmReset = true; renderApp(); break; }
        S.cfg = Defaults.makeConfig(); S.job = Defaults.makeJob(S.cfg); S.imp = null; S.link = ''; S.confirmReset = false;
        saveJSON(LS_CFG, S.cfg); saveJSON(LS_JOB, S.job); renderApp(); toast('Valores de ejemplo restablecidos');
        break;
      case 'goto-results': {
        e.preventDefault();
        var r = $('#results'); if (r) r.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      }
      default: break;
    }
  }

  function onChangeSpecial(e) {
    var t = e.target;
    var act = t.getAttribute && t.getAttribute('data-act');
    if (act === 'file') { handleFile(t.files && t.files[0]); t.value = ''; }
    else if (act === 'imp-sel') { S.imp.which = t.value === 'all' ? 'all' : Number(t.value); applyImport(); renderApp(); persist(); }
    else if (act === 'import-cfg') {
      var f = t.files && t.files[0]; t.value = '';
      if (!f) return;
      f.text().then(function (txt) {
        var data = JSON.parse(txt);
        if (!data || !data.printers || !data.materials || !data.modules) throw new Error('formato');
        S.cfg = deepMerge(Defaults.makeConfig(), data);
        ['printers', 'materials'].forEach(function (k) { S.cfg[k] = data[k]; });
        if (data.modules.discounts && Array.isArray(data.modules.discounts.tiers)) S.cfg.modules.discounts.tiers = data.modules.discounts.tiers;
        saveJSON(LS_CFG, S.cfg); S.link = ''; renderApp(); toast('Configuración importada');
      }).catch(function () { toast('El archivo no es una configuración válida.'); });
    }
  }

  function setupDrop() {
    document.addEventListener('dragover', function (e) {
      var d = e.target.closest && e.target.closest('[data-drop]');
      if (d) { e.preventDefault(); d.classList.add('over'); }
    });
    document.addEventListener('dragleave', function (e) {
      var d = e.target.closest && e.target.closest('[data-drop]');
      if (d) d.classList.remove('over');
    });
    document.addEventListener('drop', function (e) {
      var d = e.target.closest && e.target.closest('[data-drop]');
      if (!d) return;
      e.preventDefault(); d.classList.remove('over');
      handleFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
    });
  }

  // ------------------------------------------------------------------
  // Inicio
  // ------------------------------------------------------------------
  function start() {
    initState();
    document.addEventListener('input', onInput);
    document.addEventListener('change', function (e) { onChangeSpecial(e); onInput(e); });
    document.addEventListener('click', onClick);
    window.addEventListener('hashchange', function () { window.location.reload(); });
    setupDrop();
    renderApp();
  }
  start();
})();
