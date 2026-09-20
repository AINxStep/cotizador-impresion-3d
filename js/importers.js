/* importers.js — lee peso y tiempo de impresión desde archivos del laminador.
 *
 * Formatos soportados (todo se procesa en el navegador; ningún archivo se sube a ningún servidor):
 *   · .3mf laminado de Bambu Studio / OrcaSlicer ("gcode.3mf") → Metadata/slice_info.config
 *   · .gcode de Bambu Studio, OrcaSlicer y PrusaSlicer/SuperSlicer → comentarios de estadísticas
 *
 * Resultado normalizado:
 *   { source, plates: [ { index, seconds, grams, filaments: [ { type, color, grams } ] } ], warnings: [] }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Importers = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ------------------------------------------------------------------
  // ZIP mínimo: lee entradas concretas usando sólo Blob.slice + DecompressionStream
  // (no carga en memoria todo el archivo: los .gcode.3mf pueden pesar decenas de MB)
  // ------------------------------------------------------------------
  function u16(dv, o) { return dv.getUint16(o, true); }
  function u32(dv, o) { return dv.getUint32(o, true); }

  async function readBytes(blob, start, end) {
    return new Uint8Array(await blob.slice(start, end).arrayBuffer());
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Tu navegador no soporta DecompressionStream. Actualízalo o captura los datos a mano.');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** Devuelve [{name, method, csize, usize, offset}] leyendo el directorio central. */
  async function listZip(blob) {
    const size = blob.size;
    if (size < 22) throw new Error('El archivo no es un ZIP/3MF válido.');
    const tailLen = Math.min(size, 65557);
    const tail = await readBytes(blob, size - tailLen, size);
    const tdv = new DataView(tail.buffer);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tdv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('El archivo no es un ZIP/3MF válido.');
    const total = u16(tdv, eocd + 10);
    const cdSize = u32(tdv, eocd + 12);
    const cdOffset = u32(tdv, eocd + 16);
    if (cdOffset === 0xffffffff || total === 0xffff) throw new Error('ZIP64 no soportado.');

    const cd = await readBytes(blob, cdOffset, cdOffset + cdSize);
    const dv = new DataView(cd.buffer);
    const dec = new TextDecoder('utf-8');
    const entries = [];
    let p = 0;
    for (let i = 0; i < total && p + 46 <= cd.length; i++) {
      if (u32(dv, p) !== 0x02014b50) break;
      const nameLen = u16(dv, p + 28), extraLen = u16(dv, p + 30), commentLen = u16(dv, p + 32);
      entries.push({
        name: dec.decode(cd.subarray(p + 46, p + 46 + nameLen)),
        method: u16(dv, p + 10),
        csize: u32(dv, p + 20),
        usize: u32(dv, p + 24),
        offset: u32(dv, p + 42)
      });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  async function extractEntry(blob, e) {
    const head = await readBytes(blob, e.offset, e.offset + 30);
    const hdv = new DataView(head.buffer);
    if (u32(hdv, 0) !== 0x04034b50) throw new Error('Entrada ZIP dañada.');
    const start = e.offset + 30 + u16(hdv, 26) + u16(hdv, 28);
    const raw = await readBytes(blob, start, start + e.csize);
    if (e.method === 0) return raw;
    if (e.method === 8) return inflateRaw(raw);
    throw new Error('Método de compresión ZIP no soportado (' + e.method + ').');
  }

  // ------------------------------------------------------------------
  // Parsers
  // ------------------------------------------------------------------
  function attrs(tag) {
    const out = {};
    const re = /([\w:.-]+)\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = re.exec(tag))) out[m[1]] = m[2];
    return out;
  }

  /** Metadata/slice_info.config de Bambu Studio / OrcaSlicer. */
  function parseSliceInfo(xml) {
    const plates = [];
    const re = /<plate>([\s\S]*?)<\/plate>/g;
    let m;
    while ((m = re.exec(xml))) {
      const body = m[1];
      const meta = {};
      const mre = /<metadata\b([^>]*)\/?>/g;
      let mm;
      while ((mm = mre.exec(body))) {
        const a = attrs(mm[1]);
        if (a.key !== undefined) meta[a.key] = a.value;
      }
      const filaments = [];
      const fre = /<filament\b([^>]*)\/?>/g;
      let fm;
      while ((fm = fre.exec(body))) {
        const a = attrs(fm[1]);
        filaments.push({
          type: a.type || '',
          color: a.color || '',
          grams: parseFloat(a.used_g) || 0
        });
      }
      const sumFil = filaments.reduce((s, f) => s + f.grams, 0);
      plates.push({
        index: parseInt(meta.index, 10) || plates.length + 1,
        seconds: parseFloat(meta.prediction) || 0,
        grams: sumFil > 0 ? sumFil : (parseFloat(meta.weight) || 0),
        filaments: filaments
      });
    }
    return plates;
  }

  /** "1d 2h 3m 4s" → segundos */
  function parseDuration(str) {
    if (!str) return 0;
    let s = 0, any = false, m;
    const re = /(\d+(?:\.\d+)?)\s*([dhms])\b/gi;
    while ((m = re.exec(str))) {
      any = true;
      const v = parseFloat(m[1]);
      switch (m[2].toLowerCase()) {
        case 'd': s += v * 86400; break;
        case 'h': s += v * 3600; break;
        case 'm': s += v * 60; break;
        default: s += v;
      }
    }
    return any ? s : 0;
  }

  /** Estadísticas en los comentarios de un .gcode (Bambu, Orca, Prusa/Super). */
  function parseGcodeStats(text) {
    // Peso: puede ser una lista separada por comas (una por filamento).
    let grams = 0, list = null, m;
    m = text.match(/;\s*filament used \[g\]\s*[=:]\s*([\d.,\s]+)/i);
    if (m) {
      list = m[1].split(',').map(function (x) { return parseFloat(x); }).filter(function (x) { return isFinite(x); });
      grams = list.reduce(function (s, x) { return s + x; }, 0);
    }
    if (!(grams > 0)) {
      m = text.match(/;\s*total filament weight \[g\]\s*[=:]\s*([\d.]+)/i);
      if (m) { grams = parseFloat(m[1]) || 0; list = [grams]; }
    }
    // Tiempo
    let seconds = 0;
    m = text.match(/;\s*total estimated time\s*[=:]\s*([^\r\n;]+)/i) ||
        text.match(/;\s*estimated printing time \(normal mode\)\s*[=:]\s*([^\r\n;]+)/i) ||
        text.match(/;\s*estimated printing time\s*[=:]\s*([^\r\n;]+)/i);
    if (m) seconds = parseDuration(m[1]);
    if (!seconds) {
      m = text.match(/^;TIME:(\d+)/m); // Cura
      if (m) seconds = parseInt(m[1], 10);
    }
    // Tipos de filamento (opcional)
    let types = [];
    m = text.match(/;\s*filament_type\s*=\s*([^\r\n]+)/i);
    if (m) types = m[1].split(';').map(function (x) { return x.trim(); });

    const filaments = (list || []).map(function (g, i) { return { type: types[i] || '', color: '', grams: g }; });
    return { seconds: seconds, grams: grams, filaments: filaments };
  }

  // ------------------------------------------------------------------
  // API pública
  // ------------------------------------------------------------------
  async function import3mf(blob) {
    const entries = await listZip(blob);
    const info = entries.find(function (e) { return /(^|\/)slice_info\.config$/i.test(e.name); });
    if (!info) {
      const err = new Error('Este 3MF no trae datos de laminado (peso y tiempo). En Bambu Studio o OrcaSlicer lamina la placa y exporta "Archivo de placa laminada" (.gcode.3mf).');
      err.code = 'NO_SLICE_INFO';
      throw err;
    }
    const bytes = await extractEntry(blob, info);
    const plates = parseSliceInfo(new TextDecoder('utf-8').decode(bytes));
    if (!plates.length) throw new Error('No se encontraron placas laminadas dentro del 3MF.');
    return { source: 'Bambu Studio / OrcaSlicer (3MF)', plates: plates, warnings: [] };
  }

  async function importGcode(blob) {
    const CHUNK = 400 * 1024;
    const head = await blob.slice(0, Math.min(blob.size, CHUNK)).text();
    const tail = blob.size > CHUNK ? await blob.slice(Math.max(CHUNK, blob.size - CHUNK)).text() : '';
    const s = parseGcodeStats(head + '\n' + tail);
    const warnings = [];
    if (!(s.grams > 0)) warnings.push('El G-code no incluye el peso del filamento; captúralo a mano.');
    if (!(s.seconds > 0)) warnings.push('El G-code no incluye el tiempo estimado; captúralo a mano.');
    if (!(s.grams > 0) && !(s.seconds > 0)) {
      throw new Error('No se encontraron estadísticas de peso ni de tiempo en el G-code.');
    }
    return {
      source: 'G-code (Bambu / Orca / Prusa)',
      plates: [{ index: 1, seconds: s.seconds, grams: s.grams, filaments: s.filaments }],
      warnings: warnings
    };
  }

  async function importFile(file) {
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.3mf')) return import3mf(file);
    if (name.endsWith('.gcode') || name.endsWith('.gco') || name.endsWith('.g')) return importGcode(file);
    throw new Error('Formato no soportado. Usa un .gcode.3mf (Bambu Studio / OrcaSlicer) o un .gcode.');
  }

  /**
   * Convierte el resultado en datos por corrida para el cotizador: una corrida es imprimir
   * todas las placas seleccionadas una vez, así que tiempos y gramos se SUMAN.
   * which: 'all' (todas las placas del archivo = una corrida) o el índice de placa (1, 2, …).
   * Devuelve { plates, hours, minutes, filaments: [{ type, color, grams }] } — gramos y
   * tiempo TOTALES por corrida; `plates` es cuántas placas tiene la corrida.
   */
  function toRun(result, which) {
    let plates = result.plates;
    if (which !== 'all') {
      const sel = plates.filter(function (p) { return p.index === Number(which); });
      if (sel.length) plates = sel;
    }
    const n = plates.length || 1;
    const seconds = plates.reduce(function (s, p) { return s + p.seconds; }, 0);
    const byType = {};
    const order = [];
    plates.forEach(function (p) {
      const fl = p.filaments.length ? p.filaments : [{ type: '', color: '', grams: p.grams }];
      fl.forEach(function (f) {
        const key = (f.type || '') + '|' + (f.color || '');
        if (!byType[key]) { byType[key] = { type: f.type || '', color: f.color || '', grams: 0 }; order.push(key); }
        byType[key].grams += f.grams;
      });
    });
    const filaments = order.map(function (k) { return { type: byType[k].type, color: byType[k].color, grams: byType[k].grams }; });
    const totalMin = Math.round(seconds / 60);
    return { plates: n, hours: Math.floor(totalMin / 60), minutes: totalMin % 60, filaments: filaments };
  }

  return {
    importFile: importFile,
    import3mf: import3mf,
    importGcode: importGcode,
    parseSliceInfo: parseSliceInfo,
    parseGcodeStats: parseGcodeStats,
    parseDuration: parseDuration,
    toRun: toRun,
    listZip: listZip
  };
});
