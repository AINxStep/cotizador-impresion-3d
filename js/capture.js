/* capture.js — captura un elemento como PNG con SVG foreignObject (sin dependencias).
 * Clona el DOM con los estilos ya calculados, lo mete en un <foreignObject>, lo
 * dibuja en un canvas y devuelve un Blob PNG. Todo ocurre en el navegador. */
(function (root) {
  'use strict';

  /** Copia a `dst` los estilos calculados de `src` y conserva el valor de los controles. */
  function cloneStyled(src, dst) {
    if (src.nodeType !== 1) return;
    var cs = getComputedStyle(src), css = '';
    for (var i = 0; i < cs.length; i++) {
      var p = cs[i], v = cs.getPropertyValue(p);
      // los url() (p. ej. la flecha de los selects, un data-URI) no pueden cargar
      // recursos dentro de foreignObject y tumban la imagen completa: se omiten
      if (v.indexOf('url(') >= 0) continue;
      css += p + ':' + v + ';';
    }
    dst.setAttribute('style', css);
    var tag = src.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      dst.setAttribute('value', src.value);
      if (src.checked) dst.setAttribute('checked', '');
      if (tag === 'TEXTAREA') dst.textContent = src.value;
    } else if (tag === 'SELECT') {
      var opts = dst.getElementsByTagName('option');
      for (var k = 0; k < opts.length; k++) {
        if (k === src.selectedIndex) opts[k].setAttribute('selected', '');
        else opts[k].removeAttribute('selected');
      }
    }
    var sk = src.children, dk = dst.children;
    for (var j = 0; j < sk.length; j++) cloneStyled(sk[j], dk[j]);
  }

  /** Promesa con un Blob PNG del elemento completo (no sólo lo visible en pantalla). */
  function elementToPng(el, scale) {
    scale = scale || 2;
    var clone = el.cloneNode(true);
    cloneStyled(el, clone);
    clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    var rect = el.getBoundingClientRect();
    // si el contenido desborda el ancho visible, cubre el ancho real para no recortar
    var w = Math.ceil(Math.max(rect.width, el.scrollWidth)), h = Math.ceil(rect.height);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
      '<foreignObject x="0" y="0" width="' + w + '" height="' + h + '">' +
      new XMLSerializer().serializeToString(clone) +
      '</foreignObject></svg>';
    // recorte horizontal al contenido central: en ventanas anchas la página deja
    // márgenes vacíos que sólo ensucian la imagen
    var wrap = el.querySelector('main .wrap');
    var cropX = 0;
    if (wrap) {
      var wr = wrap.getBoundingClientRect();
      cropX = Math.max(0, Math.floor(wr.left - rect.left - 16)); // 16px = padding lateral del wrap
      w = Math.min(Math.ceil(wr.right - wr.left) + 32, w - cropX);
    }
    return new Promise(function (resolve, reject) {
      // data: URL — con blob: los navegadores Chromium manchan el canvas (tainted)
      // cuando el SVG lleva foreignObject y toBlob lanza SecurityError
      var img = new Image();
      img.onload = function () {
        try {
          var canvas = document.createElement('canvas');
          canvas.width = w * scale;
          canvas.height = h * scale;
          var ctx = canvas.getContext('2d');
          var bg = getComputedStyle(document.body).backgroundColor;
          if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, w, h);
          }
          ctx.scale(scale, scale);
          ctx.drawImage(img, -cropX, 0);
          canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('canvas vacío')); }, 'image/png');
        } catch (e) { reject(e); }
      };
      img.onerror = function () { reject(new Error('no se pudo renderizar la vista')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  root.Capture = { elementToPng: elementToPng };
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
