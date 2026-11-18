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

## 3. Voz al 0,9 para cumplir ≤ 17 caracteres por segundo

**Choque:** la voz Kokoro `ef_dora` a velocidad 1 habla a 17,2 car./s **de media** (medido en un short
de 47 s). Con eso ninguna agrupación puede dejar todos los subtítulos en ≤ 17 car./s, que es la regla
del QC.

**Decisión:** las plantillas piden la voz a **0,9** (Kokoro directo y `voice_rate` de MPT) y el
compilador:
- corta grupos de hasta 4 palabras como `mpt-acabado`, partidos para que quepan en 2 líneas,
- después **suaviza el ritmo**: une grupos vecinos o les pasa una palabra mientras baje el exceso
  sobre 17 car./s y sigan cabiendo en 2 líneas (un grupo puede cruzar un corte de escena),
- deja que cada grupo aparezca hasta 0,3 s antes si hay silencio y se quede hasta 0,6 s después.

El QC mide exactamente los mismos intervalos que anima el compilador (una sola función,
`intervalos()` en `src/lib/linea.ts`). Simulado sobre el short de faros: a velocidad 1 quedan 7 grupos
por encima de 17; a 0,92 o 0,9, ninguno. Si el dueño prefiere el ritmo original, la velocidad se
cambia por plantilla o por proyecto, pero el QC lo rechazará por legibilidad.

Para que quepan más caracteres por línea, en 9:16 el subtítulo pasa de 74 a 60 px (21 a 24
caracteres por línea dentro de una pastilla de 940 px), y en 1:1 a 58 px.

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

## 9. Vista previa: el render, no `hyperframes preview`

La vista previa del proyecto es el último render (aprobado o no). `hyperframes preview` abre un
servidor por proyecto y un estudio pensado para editar HTML, que en Geeper no se edita a mano. Se puede
abrir igual desde la terminal sobre `~/geeper-data/<proyecto>/build/hf-9x16`.

## 10. Puerto, datos y procesos

Web en `:3300`, worker aparte (`pnpm run worker`) y los dos juntos con `pnpm run dev:up`. Base SQLite y
proyectos en `~/geeper-data/`, fuera del repo. El worker no recarga código en caliente: tras cambiar
código, reinicia `dev:up` (reiniciarlo deja «interrumpido» lo que estaba corriendo).
