# Lo que Geeper toma de EffectCraft

<!-- revisión: 2026-11-19 · contra storytold/effectcraft@f32ad3a -->

## Qué es

[EffectCraft](https://github.com/storytold/effectcraft) es un compositor de código abierto al estilo de
After Effects, escrito en Rust (unas 570 000 líneas, licencia **MIT o Apache-2.0**; la marca ArtCraft
tiene licencia aparte y no se usa). Trae 308 efectos con los nombres, parámetros y valores por defecto
de After Effects, keyframes con su Easy Ease, 3D, expresiones, importación de `.aep`, Lottie, tracking,
SAM 2, un CLI que renderiza sin interfaz y un servidor MCP. Muchos de sus efectos están **ajustados
contra renders de After Effects 2026** (por ejemplo, el borde del Linear Wipe es una gaussiana de
σ = Feather / 2,5, medida en una muestra real).

Geeper no ejecuta ni enlaza su código: compila `geeper.json` a HTML + GSAP y lo renderiza Hyperframes.
Lo que sirve es **portar sus fórmulas** a lo que Chrome pinta en cada fotograma.

## Qué se integró (2026-11-19)

Código: [src/lib/efectos.ts](../src/lib/efectos.ts) (traducción a Hyperframes) y
[src/lib/efectos-esquema.ts](../src/lib/efectos-esquema.ts) (esquema; sin Node, lo usa también el
navegador). Pruebas: [tests/efectos.test.ts](../tests/efectos.test.ts).

| En `geeper.json` | Efecto de EffectCraft | Cómo se pinta | Fidelidad |
|---|---|---|---|
| `transicion.tipo: "barrido"` (`angulo`, `suavizado`) | Linear Wipe (`ec.transition.linearwipe`) | `mask` con `linear-gradient`; 11 paradas sobre la normal acumulada Φ | Eje, recorrido sobre la proyección de las esquinas y σ = suavizado/2,5 iguales a EffectCraft |
| `transicion.tipo: "iris"` | Iris Wipe (círculo) | `radial-gradient`, mismo borde gaussiano | After Effects usa un polígono; aquí es un círculo |
| `transicion.tipo: "radial"` (`angulo`, `sentido`) | Radial Wipe | `conic-gradient` | El suavizado se pasa a grados a media distancia (en AE es en px perpendiculares al rayo) |
| `transicion.tipo: "persianas"` (`angulo`, `ancho`) | Venetian Blinds | `repeating-linear-gradient` | Sin suavizado |
| `efectos: [{tipo:"tinte"}]` | Tint (`ec.color.tint`) | `feColorMatrix` | Exacto: luma Rec.601 entre los dos colores, mezclada por la cantidad |
| `efectos: [{tipo:"niveles"}]` | Levels | `feComponentTransfer` (tabla de 65 puntos) | Exacto salvo la interpolación entre puntos; recortes activos |
| `efectos: [{tipo:"vineta"}]` | CC Vignette | mapa radial multiplicado (`feImage` + `feComposite`) | k = 1 − cantidad·(1 − (1/(1+r²))²), 13 paradas; sin «Pin Highlights» ni cantidad negativa |
| `efectos: [{tipo:"grano"}]` | Noise (`ec.noise.noise`) | mosaico de ruido fijo (PNG de 192 px, mulberry32) que salta de posición en cada fotograma | Misma suma c + cantidad·(n − ½); determinista: dos renders dan los mismos píxeles |
| `efectos: [{tipo:"desenfoque"}]` | Gaussian Blur | `filter: blur()` | Gaussiano de Chrome |
| `fusion` (pistas libres) | Los modos de fusión de AE | `mix-blend-mode` | Los 16 que tiene CSS más «Añadir» (`plus-lighter`); los otros 21 de AE no existen en el navegador |
| `movimiento.curva` | Easy Ease (F9), Easy Ease In/Out | ease de GSAP registrada desde una Bézier cúbica | `suave` = (⅓, 0, ⅔, 1), exacto para una propiedad de una dimensión |

Detalles que importan:

- **La máscara sigue al Ken Burns.** La máscara vive en las coordenadas del elemento y se escala con
  él. El compilador calcula qué parte del elemento se ve al empezar la transición (`rectVisible`) y
  ajusta la máscara a ese rectángulo; con `mask-repeat: repeat`, al terminar no recorta nada aunque
  el encuadre siga cambiando.
- **Todo en sRGB** (`color-interpolation-filters="sRGB"`), como After Effects y EffectCraft sin
  espacio de trabajo lineal. Los filtros SVG usan linearRGB por defecto y darían otros colores.
- **Orden:** el `color` del clip va primero; después, los `efectos` en el orden de la lista (como la
  pila de efectos de AE). El desenfoque siempre va al final, fuera del SVG, para no recortarse en el
  borde de la región del filtro.
- **Efectos sólo en el clip, no en su fondo desenfocado** (modo `contener`).
- **Estilo del video** (`estilo` en `geeper.json`): aspecto, transición entre escenas y ritmo para
  todas las escenas a la vez; lo de cada escena es una excepción («Volver al estilo del video» la
  quita, y «Que todas sigan el estilo» quita todas). Lo aplica `aplicarEstilo` antes de compilar y de
  exportar a OTIO. Los proyectos viejos no tienen estilo y se ven igual; los nuevos nacen con ritmo
  «Suave».
- **UI para quien no sabe de edición** ([galeria-efectos.tsx](../src/components/galeria-efectos.tsx)):
  galerías de tarjetas con nombre simple y una línea de cuándo usar cada opción. En reposo, cada
  miniatura muestra la mitad de su transición (se distinguen sin mover el cursor); al pasar el
  cursor o con foco de teclado, anima desde el principio con la misma máscara y la misma curva que
  el render. Con «reducir movimiento» quedan quietas. La dirección se elige con flechas (→ ← ↓ ↘;
  ↻ ↺ ⇅ en el reloj), nunca con grados.
- **Superposiciones:** al subirlas, `mezcla-auto.ts` mira un fotograma: fondo negro → «Aclarar»
  (trama), fondo blanco → «Oscurecer» (multiplicar), con transparencia o imagen completa → normal.
  En la lista se cambia entre Normal, Aclarar, Oscurecer y Contraste, y también su entrada y aspecto.
  Los 17 modos siguen disponibles en `geeper.json` (y para Claude).
- **OTIO:** efectos y fusión viajan en `metadata.geeper`, como el resto de lo que OTIO no modela.

### Verificación

- Chromium 1254, una imagen de prueba por variante a media transición: los 12 casos se ven como
  se espera.
- Proyecto de 12 s con tinte, viñeta, grano, barrido diagonal sobre Ken Burns, iris y una
  superposición en `trama` con barrido radial: `hyperframes check` sin errores ni avisos; el render
  (borrador, 30 fps) tarda **13,5 s, contra 8,8 s** del mismo proyecto sin efectos.
- El mismo fotograma con grano da el mismo MD5 en dos renders.

### Segunda opinión (Nemotron Ultra, 2026-11-19)

**Aceptado:** la máscara no puede vivir sin más en el mismo elemento que el Ken Burns (por eso
existe `rectVisible`); el grano no debe recalcular ruido en cada fotograma ni depender de
`feTurbulence` (por eso es un mosaico fijo que se mueve); y conviene un solver de Bézier general en
vez de eases con nombre.

**Descartado:**
- *Cambiar tinte y niveles por `sepia()`, `hue-rotate()` y similares por velocidad:* dejan de ser
  exactos, y `feColorMatrix` es una sola multiplicación de matriz. Medido: todos los efectos juntos
  suman ~50 % al render.
- *Hacer el borde suave con `filter: blur()` sobre la máscara:* la CDF gaussiana cabe exacta en las
  paradas del degradado, sin otra pasada.
- *`plus-lighter` no es estándar:* está en CSS Compositing nivel 2 y Chrome lo soporta.

## Lo que no se tomó, y cuándo convendría

| Pieza | Por qué no ahora | Cuándo |
|---|---|---|
| **Render por plantillas** (`effectcraft-cli render --template T.ectemplate --values V.json`), que es como un MOGRT sin interfaz | Requiere Rust 1.95 (no está instalado), el proyecto es joven y duplicaría el compositor | Cuando una pieza pida 3D, partículas o simulaciones: un worker que renderice la plantilla a ProRes 4444 o WebM con alfa y la sume como asset de una pista libre (`source: "effectcraft"`). Encaja en el diseño de un motor por proceso aparte |
| Los otros ~290 efectos (Turbulent Displace, Card Dance, Shatter, Particle 3D…) | La mayoría no se pueden hacer con CSS o SVG a un costo razonable | Por la vía de las plantillas de arriba, o con bloques del registro de Hyperframes |
| Tracking de puntos (`track`: correlación cruzada normalizada + Lucas–Kanade) | E4 ya sigue caras con YuNet (`caras.ts`) | Si hace falta seguir algo que no sea una cara (un producto, un logo): portar el tracker a `py/` |
| SAM 2 / MobileSAM (`segment`, `sam2`) | Pesado; no hay un caso de uso hoy | Para texto detrás del sujeto o recortes: el registro de modelos del crate (autor, licencia, URL, tamaño, SHA-256) es la referencia para Q5/P1 |
| Interchange (FCPXML, EDL, AAF) | Geeper ya exporta `.otio`, que Resolve abre | Si alguien edita en Final Cut o Avid |
| Lottie | Hyperframes tiene su propio registro de bloques | Para usar animaciones de LottieFiles como superposición |
| Expresiones (`wiggle`, `loopOut`), animadores de texto con selectores de rango | Geeper no tiene keyframes libres todavía | Con E3 (línea de tiempo con arrastre) |
| MCP y CLI con un registro de comandos único | Idea de diseño, no código: cada acción con un id y parámetros JSON | Si Geeper expone sus `ediciones` por MCP a Claude, conviene copiar ese patrón |
| ADR 0001 (efectos nativos como procesos hijos con protocolo versionado) | Geeper ya hace esto con sus workers | — |

## Licencia y atribución

Las fórmulas se reescribieron en TypeScript a partir del código de EffectCraft (MIT o Apache-2.0).
Los encabezados de `efectos.ts` y `efectos-esquema.ts` citan el origen; no se copiaron archivos ni
recursos de marca.
