/* pdf.js — generador mínimo de PDF (sin dependencias, navegador y Node).
 * Produce una hoja carta con texto Helvetica en codificación WinAnsi (Latin-1:
 * cubre acentos y ñ). El resultado es una cadena de bytes; PDF.bytes() la
 * convierte a Uint8Array para descargarla como Blob en el navegador.
 *
 * spec = {
 *   title, biz, contact, date, project, client,
 *   rows:   [{ concept, sub, qty, unit, amount }],
 *   totals: [[label, value], …]           // la última fila es el total grande
 *   foot:   [líneas de texto al pie]
 * }
 */
(function (root) {
  'use strict';
  var W = 612, H = 792, M = 48; // carta en puntos, margen

  // caracteres fuera de Latin-1 que sí existen en WinAnsi
  var WINCODES = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  var WINBYTES = [0x80, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8A, 0x8B, 0x8C,
    0x8E, 0x91, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0x9B, 0x9C, 0x9E, 0x9F];
  var WIN = {};
  WINBYTES.forEach(function (b, i) { WIN[WINCODES[i]] = String.fromCharCode(b); });

  function enc(s) {
    return String(s == null ? '' : s)
      .replace(/[^\x00-\xFF]/g, function (c) { return WIN[c] || '?'; })
      .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  // Ancho aproximado en unidades Helvetica (por mil de em); los dígitos y
  // signos de moneda son exactos, así las columnas de dinero quedan alineadas.
  function cw(c) {
    var n = c.charCodeAt(0);
    if (c === ' ') return 278;
    if ("iIl.,:;!|'`".indexOf(c) >= 0) return 278;
    if ('()[]{}-'.indexOf(c) >= 0) return 333;
    if ((n >= 48 && n <= 57) || '$€£¥¢'.indexOf(c) >= 0) return 556;
    if ('%‰'.indexOf(c) >= 0) return 889;
    if ('mwMW'.indexOf(c) >= 0) return 850;
    if (n >= 65 && n <= 90) return 667;
    return 556;
  }
  function tw(s, size) {
    var t = 0;
    for (var i = 0; i < String(s).length; i++) t += cw(String(s)[i]);
    return t * size / 1000;
  }
  function clip(s, maxw, size) {
    s = String(s == null ? '' : s);
    if (tw(s, size) <= maxw) return s;
    while (s.length && tw(s + '…', size) > maxw) s = s.slice(0, -1);
    return s + '…';
  }
  function wrap(s, maxw, size) {
    var words = String(s == null ? '' : s).split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (cur && tw(t, size) > maxw) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    return lines;
  }

  function build(spec) {
    var ops = [];
    function T(x, y, s, f, r, g, b, str) {
      ops.push('BT /' + f + ' ' + s + ' Tf ' + r + ' ' + g + ' ' + b + ' rg ' +
        x.toFixed(1) + ' ' + y.toFixed(1) + ' Td (' + enc(str) + ') Tj ET');
    }
    function TR(x, y, s, f, r, g, b, str) { T(x - tw(str, s), y, s, f, r, g, b, str); } // alineado a la derecha
    function rect(x, y, w, h, r, g, b) { ops.push(r + ' ' + g + ' ' + b + ' rg ' + x.toFixed(1) + ' ' + y.toFixed(1) + ' ' + w.toFixed(1) + ' ' + h.toFixed(1) + ' re f'); }
    function rule(x1, y1, x2, y2, w, r, g, b) { ops.push(r + ' ' + g + ' ' + b + ' RG ' + w + ' w ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' m ' + x2.toFixed(1) + ' ' + y2.toFixed(1) + ' l S'); }

    var NAVY = [0.11, 0.13, 0.33], ORANGE = [0.88, 0.35, 0.12], INK = [0.13, 0.14, 0.31],
      GRAY = [0.43, 0.45, 0.53], PALE = [0.78, 0.79, 0.90], WHITE = [1, 1, 1],
      BGT = [0.925, 0.933, 0.957], LINE = [0.86, 0.87, 0.91];

    // Encabezado
    rect(0, H - 74, W, 74, NAVY[0], NAVY[1], NAVY[2]);
    rect(0, H - 77, W, 3, ORANGE[0], ORANGE[1], ORANGE[2]);
    T(M, H - 42, 18, 'F2', WHITE[0], WHITE[1], WHITE[2], spec.title || 'COTIZACIÓN');
    if (spec.biz) T(M, H - 60, 9.5, 'F1', PALE[0], PALE[1], PALE[2], clip(spec.biz, 300, 9.5));
    if (spec.date) TR(W - M, H - 42, 9.5, 'F1', PALE[0], PALE[1], PALE[2], spec.date);
    if (spec.contact) TR(W - M, H - 60, 9.5, 'F1', PALE[0], PALE[1], PALE[2], clip(spec.contact, 220, 9.5));

    // Proyecto / cliente
    var y = H - 106;
    T(M, y, 8, 'F2', GRAY[0], GRAY[1], GRAY[2], 'PROYECTO');
    T(M + 62, y, 10, 'F1', INK[0], INK[1], INK[2], clip(spec.project || '—', 330, 10));
    T(M + 400, y, 8, 'F2', GRAY[0], GRAY[1], GRAY[2], 'CLIENTE');
    T(M + 450, y, 10, 'F1', INK[0], INK[1], INK[2], clip(spec.client || '—', 110, 10));

    // Tabla
    y = H - 146;
    var cQ = W - M - 200, cU = W - M - 100, cA = W - M;
    rect(M, y - 15, W - 2 * M, 21, BGT[0], BGT[1], BGT[2]);
    T(M + 4, y - 8, 8, 'F2', GRAY[0], GRAY[1], GRAY[2], 'CONCEPTO');
    TR(cQ, y - 8, 8, 'F2', GRAY[0], GRAY[1], GRAY[2], 'CANT.');
    TR(cU, y - 8, 8, 'F2', GRAY[0], GRAY[1], GRAY[2], 'P. UNITARIO');
    TR(cA, y - 8, 8, 'F2', GRAY[0], GRAY[1], GRAY[2], 'IMPORTE');
    y -= 15;
    (spec.rows || []).forEach(function (r) {
      y -= r.sub ? 18 : 15;
      T(M + 4, y, 10, 'F2', INK[0], INK[1], INK[2], clip(r.concept, cQ - M - 40, 10));
      TR(cQ, y, 10, 'F1', INK[0], INK[1], INK[2], r.qty);
      TR(cU, y, 10, 'F1', INK[0], INK[1], INK[2], r.unit);
      TR(cA, y, 10, 'F1', INK[0], INK[1], INK[2], r.amount);
      if (r.sub) { y -= 11; T(M + 4, y, 8, 'F1', GRAY[0], GRAY[1], GRAY[2], clip(r.sub, cQ - M - 40, 8)); }
      y -= 7;
      rule(M, y, W - M, y, 0.5, LINE[0], LINE[1], LINE[2]);
    });

    // Totales (la última fila es el total grande)
    (spec.totals || []).forEach(function (t, i) {
      var last = i === spec.totals.length - 1;
      if (last) { y -= 6; rule(M, y, W - M, y, 0.8, ORANGE[0], ORANGE[1], ORANGE[2]); }
      y -= last ? 22 : 16;
      var sz = last ? 12 : 9.5, fnt = last ? 'F2' : 'F1', col = last ? NAVY : GRAY;
      TR(cU - 10, y, sz, fnt, col[0], col[1], col[2], t[0]);
      TR(cA, y, sz, 'F2', col[0], col[1], col[2], t[1]);
    });

    // Pie
    y -= 30;
    (spec.foot || []).forEach(function (f) {
      wrap(f, W - 2 * M, 8).forEach(function (ln) {
        if (y > 42) { T(M, y, 8, 'F1', GRAY[0], GRAY[1], GRAY[2], ln); y -= 11; }
      });
    });
    var mark = 'Generado con el Cotizador de Impresión 3D';
    T((W - tw(mark, 7)) / 2, 26, 7, 'F1', GRAY[0], GRAY[1], GRAY[2], mark);

    // Ensamblado del documento
    var stream = ops.join('\n');
    var objs = [
      '<</Type/Catalog/Pages 2 0 R>>',
      '<</Type/Pages/Kids[3 0 R]/Count 1>>',
      '<</Type/Page/Parent 2 0 R/MediaBox[0 0 ' + W + ' ' + H + ']/Resources<</Font<</F1 4 0 R/F2 5 0 R>>>>/Contents 6 0 R>>',
      '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
      '<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold>>',
      '<</Length ' + stream.length + '>>\nstream\n' + stream + '\nendstream'
    ];
    var out = '%PDF-1.4\n';
    var offs = [];
    objs.forEach(function (o, i) { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    var xref = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    offs.forEach(function (o) { out += ('0000000000' + o).slice(-10) + ' 00000 n \n'; });
    out += 'trailer\n<</Size ' + (objs.length + 1) + '/Root 1 0 R>>\nstartxref\n' + xref + '\n%%EOF\n';
    return out;
  }

  function bytes(s) {
    var b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
    return b;
  }

  var api = { build: build, bytes: bytes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PDF = api;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
