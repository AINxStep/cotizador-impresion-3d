'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PDF = require('../js/pdf.js');

const spec = {
  title: 'COTIZACIÓN', biz: 'Taller 3D Norte', contact: '555-1234',
  date: '20 de septiembre de 2026', project: 'Soporte audífonos', client: 'Ana',
  rows: [
    { concept: 'Impresión 3D · PLA', sub: '50 piezas · precio por pieza', qty: '50', unit: '$45.50', amount: '$2,275.00' },
    { concept: 'Envío', sub: '', qty: '1', unit: '$80.00', amount: '$80.00' }
  ],
  totals: [['Subtotal', '$2,355.00'], ['IVA (16 %)', '$376.80'], ['TOTAL', '$2,731.80']],
  foot: ['Vigencia de la cotización: 15 días.', 'Cotización estimada.']
};

test('el documento generado es un PDF válido de una página', () => {
  const out = PDF.build(spec);
  assert.ok(out.startsWith('%PDF-1.4'), 'encabezado PDF');
  assert.ok(out.trimEnd().endsWith('%%EOF'), 'terminador EOF');
  // la tabla xref debe apuntar exactamente a cada objeto
  const xrefPos = out.indexOf('\nxref\n') + 1;
  assert.equal(parseInt(out.match(/startxref\n(\d+)/)[1]), xrefPos, 'startxref apunta a la tabla');
  const offs = out.slice(xrefPos).split('\n').slice(3, 9); // 6 objetos (la entrada 0 es la libre)
  assert.ok(offs.every((l, i) => out.slice(parseInt(l.slice(0, 10))).startsWith((i + 1) + ' 0 obj')),
    'cada offset del xref apunta a su objeto');
});

test('el contenido queda en Latin-1 con los caracteres especiales escapados', () => {
  const out = PDF.build(spec);
  assert.ok(!/[\u0100-\uFFFF]/.test(out), 'nada fuera de Latin-1 (los bytes son seguros)');
  assert.match(out, /\(COTIZACI/, 'el título llega al documento');
  assert.match(out, /Soporte aud/, 'los acentos de Latin-1 pasan intactos');
  // caracteres que romperían la sintaxis del stream quedan escapados
  const par = PDF.build({ title: 'X (con paréntesis) \\ y', rows: [], totals: [], foot: [] });
  assert.ok(par.includes('(X \\(con par'), 'los paréntesis se escapan en el stream');
});
