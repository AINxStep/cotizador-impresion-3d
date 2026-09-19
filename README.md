# Cotizador de Impresión 3D

Calculadora en línea para cotizar proyectos de impresión 3D con **todos los costos** a la vista: material, tiempo de máquina, electricidad, mano de obra, fallas, postprocesado, empaque, comisiones, margen e IVA.

Es una página estática (HTML + CSS + JavaScript, sin servidor ni dependencias), pensada para quien se dedique a la impresión 3D, con dos modos:

- **Taller:** cada persona configura sus propias impresoras, materiales y tarifas, y ve el desglose completo de costos, utilidad y margen real.
- **Cliente:** muestra únicamente el precio y un resumen. Se puede compartir un enlace que lleva **sólo tus tarifas de venta**, nunca tus costos, márgenes ni utilidad.

## Qué incluye

- Desglose por concepto y gráfica de "¿a dónde se va el precio?", con utilidad, margen real y utilidad por hora de máquina.
- **Lee el archivo del laminador:** arrastra un `.gcode.3mf` (Bambu Studio, OrcaSlicer) o un `.gcode` (Bambu, Orca, PrusaSlicer) y se llenan peso por filamento, tiempo y número de placas. El archivo se procesa en el navegador; no se sube a ningún servidor.
- Varias impresoras (depreciación, mantenimiento y consumo eléctrico por hora) y varios materiales (costo por gramo).
- Módulos opcionales que se activan o desactivan: diseño y modelado, postprocesado e insumos, multicolor y purga, empaque, comisiones de plataforma o cobro, pedido mínimo, recargo por urgencia y descuento por volumen.
- Margen sobre el precio **o** multiplicador sobre el costo, con la equivalencia entre ambos.
- Moneda configurable (MXN por defecto), IVA opcional y redondeo del precio hacia arriba.
- Cotización para el cliente: copiar como texto o imprimir / guardar como PDF (siempre sin costos internos).
- Enlace para clientes, respaldo de la configuración en un archivo JSON y tema claro/oscuro automático.
- Tu configuración se guarda sólo en tu navegador (`localStorage`).

> Todos los valores iniciales son **ejemplos**. Reemplázalos con los de tu taller en la pestaña *Configuración del taller*.

## Cómo se calcula

```
Material     = Σ gramos × (1 + merma) × precio_por_gramo
Máquina      = horas × [ precio × (1 − rescate) / vida_útil + mantenimiento_por_hora ]
Electricidad = horas × (watts / 1000) × precio_kWh
Con fallas   = (Material + Máquina + Electricidad) / (1 − tasa_de_fallas)

Costo        = Con fallas + mano de obra + diseño + postprocesado + insumos + empaque
               + indirectos% × (todo lo anterior)

Precio base  = Costo / (1 − margen)          ó          Costo × multiplicador
             → urgencia → descuento por volumen → comisión → mínimo → envío → redondeo → IVA
```

Puntos importantes:

- **Las fallas se dividen, no se suman:** con 10 % de impresiones perdidas el costo sube 11.1 %, no 10 %.
- **Margen no es sobreprecio:** sumar 30 % al costo produce sólo 23 % de margen. Un margen de 40 % equivale a multiplicar el costo por 1.67.
- **La comisión se calcula "hacia atrás"** (`precio = (base + cargo_fijo) / (1 − comisión)`), para que después de pagarla tu utilidad no baje.
- **Tu tiempo es un costo:** la mano de obra se cobra aunque el trabajo sea tuyo.

La pestaña *Metodología* de la propia página explica cada paso.

### Modo Cliente sin revelar costos

El precio del modo Cliente sale de **tarifas de venta** derivadas de tu configuración (precio por gramo de cada material, por hora de cada impresora, por placa y por pedido). Como el modelo es lineal, esas tarifas reproducen exactamente el mismo precio que el modo Taller. Las pruebas automáticas comprueban ambas cosas: que los precios coinciden y que las tarifas no contienen costos, márgenes ni utilidad.

El enlace se genera en *Configuración del taller → Compartir con clientes* y lleva las tarifas codificadas en la parte `#c=…` de la URL (no se envía a ningún servidor). Cualquiera con el enlace puede ver esas tarifas de venta.

## Usarlo

**En línea:** abre la página publicada con GitHub Pages (ver la sección de publicación).

**Local:** basta con abrir `index.html`, o servirlo:

```bash
python3 -m http.server 8080   # y abre http://localhost:8080
```

Para compartir enlaces con clientes usa la versión publicada, porque un enlace `file://` sólo funciona en tu computadora.

## Publicar en GitHub Pages

1. En el repositorio: **Settings → Pages**.
2. En *Build and deployment* elige **Deploy from a branch**, rama `main` y carpeta `/ (root)`.
3. En un par de minutos queda disponible en `https://<tu-usuario>.github.io/<nombre-del-repositorio>/`.

## Pruebas

```bash
npm test
```

Usa el ejecutor de pruebas integrado de Node (18 o superior; no hay dependencias que instalar). Cubren el motor de cálculo (casos verificados a mano, fallas, comisiones, mínimo, descuentos, redondeo, IVA), la equivalencia entre modo Taller y modo Cliente con 300 trabajos aleatorios, la ausencia de datos de costo en las tarifas públicas y la lectura de archivos `.3mf` y `.gcode` (los archivos de ejemplo se generan al vuelo; no hay binarios en el repositorio).

## Estructura

```
index.html            Página principal
css/styles.css        Estilos (claro/oscuro, móvil, impresión)
js/calc.js            Motor de cálculo (sin dependencias, corre en navegador y Node)
js/importers.js       Lectura de .gcode.3mf y .gcode (ZIP mínimo, sin librerías)
js/defaults.js        Valores iniciales de ejemplo
js/ui.js              Constructores de HTML y formato
js/app.js             Estado, eventos y persistencia
tests/                Pruebas y ayudantes para generar archivos de ejemplo
```

## Fuentes consultadas

- [FilaQuote: cuánto cobrar por impresión 3D (2026)](https://filaquote.com/guides/how-much-to-charge-for-3d-printing/)
- [Siraya Tech: fórmula de precios](https://siraya.tech/blogs/news/how-to-price-3d-prints)
- [Mandarin3D: costos ocultos al cotizar](https://mandarin3d.com/blog/how-to-price-3d-printing-jobs)
- [3DPCC: fórmula del costo de impresión 3D](https://3dpcc.news/3d-printing-cost-formula)
- [UnoTV: tarifas domésticas de CFE, junio 2026](https://www.unotv.com/nacional/las-tarifas-domesticas-de-cfe-van-de-1-a-4-pesos-por-kwh-en-junio-de-2026/)
- [Foro de Bambu Lab: consumo de energía de la H2D](https://forum.bambulab.com/t/what-about-effective-energy-consumption/163839)

## Ideas para más adelante

- Historial de cotizaciones guardadas y exportación a CSV.
- Estimación de peso y tiempo a partir de un STL.
- Perfiles de material con densidad y temperatura, e interfaz en inglés.

## Aviso

Es una herramienta de estimación. No constituye asesoría fiscal ni contable; revisa con tu contador cómo facturar y qué impuestos aplican.

## Licencia

[MIT](LICENSE)
