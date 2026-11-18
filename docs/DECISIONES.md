# Decisiones del MVP

Lo que cambió respecto de `PRODUCTO.md` o del encargo, y por qué. Cada entrada dice la alternativa
elegida; nada de esto cambia el alcance en silencio.

## 1. La música la mezcla Geeper, no MPT

**Choque:** MPT elige la música al azar (`bgm_type: random`) y no registra cuál usó, así que no se puede
volver a mezclar después de quitar una escena o cambiar la voz, ni anotar su licencia.

**Decisión:** Geeper pide a MPT el video **sin música** (`bgm_type: ""`) y arma su propia mezcla con
ffmpeg: voz por escenas con fundidos de 15 ms, música en bucle con *ducking* (`sidechaincompress`) y
salida suave. La pista sale de la carpeta que diga la plantilla, se elige de forma estable por proyecto
y queda en `geeper.json` con su licencia. Los shorts que MPT ya había generado con música se importan
con su voz limpia (`audio.mp3`) y la música de la plantilla, no la original.

## 2. Licencia de la música de MPT: desconocida

El README de MPT dice que `resource/songs` viene de videos de YouTube («si infringe, bórrala»).
«GTA VI Shorts» la sigue usando para no cambiar el sonido del canal, pero cada asset dice
`licencia: desconocida` y el QC lo muestra como **aviso** (no bloquea). «Dimerso» va sin música.

**Propuesta (costo US$0):** bajar a mano una carpeta de música con licencia clara (por ejemplo, la
Biblioteca de audio de YouTube o pistas CC0) y apuntar `musica.carpeta` y `musica.licencia` de la
plantilla ahí desde la página Plantillas.

## 3. Voz al 0,85 para acercarse a ≤ 17 caracteres por segundo

**Choque:** la voz Kokoro `ef_dora` a velocidad 1 habla a ~17,2 car./s **de media** (medido en un short
de 47 s). Con eso ninguna agrupación deja todos los subtítulos en ≤ 17 car./s, que es la regla del QC.

**Decisión:** las plantillas piden la voz a **0,85** (`voice_rate` de MPT y `voz.velocidad`) y el
compilador:
- corta grupos de hasta 4 palabras como `mpt-acabado`, partidos para que quepan en 2 líneas,
- **suaviza el ritmo**: une grupos vecinos o les pasa una palabra mientras baje el exceso sobre
  17 car./s y sigan cabiendo en 2 líneas (un grupo puede cruzar un corte de escena),
- deja que cada grupo aparezca hasta 0,3 s antes si hay silencio y se quede hasta 0,6 s después,
- empieza cada video con **0,3 s de entrada** en silencio (la imagen ya se ve), así el primer
  subtítulo no queda a 19 car./s porque la voz arrancaba en el segundo 0.

El QC mide exactamente los mismos intervalos que anima el compilador (`intervalos()` en
`src/lib/linea.ts`).

**Medido** sobre 5 shorts reales de MPT (voz regenerada con el Kokoro de MPT):

| Velocidad | Aprobados por legibilidad | Peor pico |
|---|---|---|
| 0,9 | 1 de 5 | 17,44 car./s |
| 0,85 | 3 de 4 | 17,39 car./s (el que falla) |

**Pendiente del dueño:** con 0,85 un short de cada cuatro todavía queda apenas por encima (17,4). Las
salidas son (a) voz a 0,8, (b) aceptar 18 car./s para shorts con karaoke (el texto aparece al ritmo
de la voz, no hay que leerlo de corrido) o (c) dejarlo así y corregir a mano el guion de los que
fallen. La regla vive en `OBJETIVO.maxCps` (`src/lib/qc.ts`).

En 9:16 el subtítulo pasa de 74 a 60 px (24 caracteres por línea en una pastilla de 940 px) y en 1:1 a
58 px, para que quepan grupos más largos.

### 3 bis. Regenerar la voz: Kokoro de MPT, no el de Hyperframes

`hyperframes tts` (Kokoro-82M por kokoro-onnx) a 0,9 habla tan rápido como MPT a 1,0 y reparte peor
las pausas: necesitaría ~0,82 para pasar el QC. Por eso regenerar la voz usa `POST /api/v1/audio` de
MPT (sólo voz: Kokoro en CPU, sin LLM ni imágenes, sin GPU) y suena igual que el short original. El
motor `kokoro` (Hyperframes, con el venv del estudio en `HYPERFRAMES_PYTHON`) queda como alternativa por
proyecto si MPT no está levantado.

## 4. Los cortes de escena se ajustan a silencios y fin de frase

MPT reparte los clips cada 6 s sin mirar la voz. Geeper corta las escenas cerca de esos múltiplos,
pero en el límite entre palabras con más silencio y, si hay, en un punto o una coma (±2 s). Así quitar
o mover una escena no corta una palabra. Whisper suele dar tiempos contiguos, por eso el puntaje
premia la puntuación.

## 5. Render con NVENC si la GPU está libre; si no, CPU

El render pasa por `gpu-lock`, pero **sin esperar**: si la GPU está ocupada (por ejemplo, MPT generando
otro tema del lote), renderiza con libx264 y Chrome por software. Así reeditar nunca queda bloqueado
detrás de una generación. Chrome captura siempre por software en WSL (Hyperframes no ve
`/dev/dri/renderD128`): es como ya funcionaba `mpt-acabado`.

## 6. whisper.cpp corre en CPU

`hyperframes transcribe` compila whisper.cpp sin CUDA (`GGML_CUDA=OFF`), así que la alineación no
usa la GPU ni toma `gpu-lock`. `medium` tarda unos 30 s por un short de 47 s.

## 7. Detección de reinicio: Kernel-Power 41 + arranque de WSL + lease

Al arrancar, el worker busca eventos Kernel-Power 41 posteriores al último latido guardado y, además,
compara el arranque de WSL (`/proc/stat btime`) con ese latido, porque un reinicio limpio o un
`wsl --shutdown` no deja un evento 41. Si hubo reinicio, todo lo que estaba «corriendo» pasa a
«interrumpido». Sin reinicio, se mira el lease: los trabajos de GPU con lease vencido quedan
«interrumpidos» (nunca se reintentan solos) y los de CPU vuelven a la cola.

Revisión de Nemotron Ultra (2026-11-17), verificada contra el diseño:
- **Aceptado:** un trabajo «hecho» no se puede relanzar (evita que la cadena se bifurque); la huella
  del motor (`input_hash`) incluye la versión de ffmpeg y de Hyperframes; ancla de encuadre por clip.
- **Descartado:** quitar la consulta de Kernel-Power 41 (el encargo la pide; el lease ya es la
  evidencia principal); «ripple» manual de los clips (la posición en la línea de tiempo no se guarda,
  se deriva del orden); que el `flock` lo herede el render (es hermano del proceso que retiene el
  candado, no hijo); quitar `mostrar` (va por palabras, no por desplazamientos de texto).

## 8. Correcciones de subtítulos y regenerar la voz

Corregir un subtítulo guarda una corrección sobre las palabras **oídas** de la escena (índices), no
sobre el texto. Si después se regenera la voz y la escena dice exactamente las mismas palabras, las
correcciones se conservan; si el texto cambió, se descartan (los índices ya no valen) y hay que
volver a corregir.

## 9. Vista previa: el render, no `hyperframes preview` (superada por §14)

La vista previa del proyecto es el último render (aprobado o no). `hyperframes preview` abre un
servidor por proyecto y un estudio pensado para editar HTML, que en Geeper no se edita a mano. Se puede
abrir igual desde la terminal sobre `~/geeper-data/<proyecto>/build/hf-9x16`.

## 10. Duración en el QC: la del stream de video

El contenedor MP4 suma el relleno del códec AAC (unos 0,1 s), así que medir `format.duration` rechazaba
renders correctos. El QC mide la duración del stream de video contra la esperada (± 2 fotogramas) y
aparte exige que el audio no se aparte más de 0,15 s del video.

## 11. Pico real a −2 dBTP

`loudnorm` apunta a −2 dBTP (no −1,5): tras codificar en AAC el pico real sube unas décimas y con
−1,5 quedaba en −1,03, al borde de la regla de ≤ −1.

## 12. Puerto, datos y procesos

Web en `:3300`, worker aparte (`pnpm run worker`) y los dos juntos con `pnpm run dev:up`. Base SQLite y
proyectos en `~/geeper-data/`, fuera del repo. El worker no recarga código en caliente: tras cambiar
código, reinicia `dev:up` (reiniciarlo deja «interrumpido» lo que estaba corriendo). Si el worker muere
solo, `dev:up` lo vuelve a lanzar (hasta 5 veces en 10 min) y el barrido de leases marca
«interrumpido» lo que tenía. Un `kill -9` del worker deja huérfano el render de Hyperframes que estaba
corriendo: termina solo y su temporal nunca recibe el nombre final.

## 13. Entrega liviana: libx264 High CRF 20 sobre el máster de Hyperframes

**Choque:** el render `--quality delivery` de Hyperframes sale en H.264 Main a ~16 Mbps: un short de
57 s pesaba 115 MB, que es lento de subir y ocupa disco sin ganar calidad visible.

**Decisión:** el render de Hyperframes queda como máster (`build/crudo-<perfil>.mp4`) y el archivo
entregado se recodifica en la misma pasada que el `loudnorm` (`ENTREGA` en `src/lib/qc.ts`): libx264
`slow`, CRF 20, perfil High, keyframe cada 2 s, tope de 12 Mbps, etiquetas Rec.709 y AAC 192k sin PNS
(`-aac_pns 0`, de explainroo). Medido sobre el short de los barcos: **115 MB → 31,5 MB** (4,2 Mbps),
SSIM 0,992 frente al máster, 14 s de CPU, QC aprobado. CRF 18 daba 43 MB (SSIM 0,993) y CRF 22,
23 MB (0,991). No hay `libvmaf` en el ffmpeg local; si se instala, el criterio es VMAF ≥ 93.

Cada render deja también `v<N>-<perfil>.srt` con los mismos intervalos que anima el compilador, para
subirlo junto al video.

Origen: revisión de `zhuyansen/awesome-claude-video-skills` (2026-11-18). Lo heredado y lo
descartado está en `docs/HEREDADO.md`.

## 14. Vista previa en vivo con `<hyperframes-player>`

El editor tiene dos pestañas: «En vivo» y «Último render». «En vivo» compila la versión actual sin
renderizar (`src/lib/vista-previa.ts`: mezcla + compilación, ~0,8 s la primera vez y ~30 ms después,
cacheado por versión, compilador y plantilla en `build/vista-<formato>/`) y la reproduce con
`@hyperframes/player` 0.9.27, de la misma versión que el render. Al guardar una edición se ve al
instante; el QC y la descarga siguen siendo del render.

**Choque encontrado:** si la composición expone `window.__timelines`, el player la maneja «en directo»
(sólo GSAP) y no inyecta el runtime de Hyperframes, que es quien muestra y oculta cada clip: se veía
siempre el último clip. La vista previa enlaza una copia local de `@hyperframes/core` 0.9.27
(`hyperframe.runtime.iife.js`, sin CDN); el HTML del render no cambia. Verificado en Chrome headless:
listo en ~0,5 s, duración 57,44 s igual al render y saltos exactos con el mismo clip y subtítulo que el
render (`scripts/ui/vista-en-vivo.ts`).

Diferencias conocidas: el ajuste de línea de los subtítulos puede variar un poco por las fuentes del
navegador, y los clips de MPT tienen un keyframe cada 6 s, así que un salto tarda un instante más en
mostrar la imagen.
