# Qué heredamos de otros proyectos de video

Revisión del 2026-11-18 de [zhuyansen/awesome-claude-video-skills](https://github.com/zhuyansen/awesome-claude-video-skills)
(520 repos; se leyó el código de 10) y de los cinco del artículo «5 Best GitHub Repo for Claude Videos».
Las rutas son dentro de cada repo. Todo lo listado es local y gratis salvo que diga lo contrario.

## Ya hecho

| Qué | De dónde | Resultado |
|---|---|---|
| Entrega libx264 High CRF 20, GOP 2 s, tope 12 Mbps | Medición propia (halfsize da los umbrales SSIM/VMAF) | 115 MB → 31,5 MB, SSIM 0,992 (DECISIONES §13) |
| AAC sin PNS (`-aac_pns 0`) | vincentsch/explainroo `src/ffmpeg.js:87` (MIT) | Sin chasquidos en pasajes suaves |
| `.srt` junto a cada render | iart-ai/tiktok-video-skills (MIT) | Botón «Subtítulos (.srt)» en el proyecto |
| Sección Anuncios: resultados pass/fail/unknown con evidencia, specs sin límites congelados, marcos de copy como preguntas, conceptos distintos, diseño de pruebas | AgriciDaniel/claude-ads `ads/references/*`, `skills/ads-{create,creative,test}` (MIT) | `/anuncios`, ver `docs/ANUNCIOS.md` |

## Para Geeper actual (orden sugerido)

1. **Vista previa en vivo en el editor** (idea del Player de Remotion): mostrar `build/hf-*/index.html`
   en un iframe y hacer *seek* de la línea de tiempo. Ojo: los clips de MPT traen un solo keyframe cada
   6 s; en el navegador eso congela al saltar (hyperframes `skills/hyperframes/references/overlays.md:37`).
   Si se hace, recodificar los clips con `-g 30` al importar. El render no se ve afectado: extrae los
   fotogramas con ffmpeg (verificado: el QC nunca vio congelados).
2. **Pico real tras el AAC con reintento** (explainroo `src/ffmpeg.js:96-150`): medir el TP del archivo
   final y, si pasa de −1, `alimiter` a 192 kHz y recodificar (hasta 4 veces). Hoy apuntamos a −2 y
   medimos −1,86: margen corto.
3. **Texto del guion con tiempos de Whisper** (explainroo `src/align.js`): alinear por distancia de
   edición; el subtítulo conserva la ortografía del guion. Arreglaría «corrección perdida al regenerar la voz».
4. **Limpiar alucinaciones de Whisper** en el silencio final (hyperframes `captions.md:8-10`: descartar
   palabras que empiezan dentro de `silencedetect=noise=-35dB:d=0.6`; >20 % basura = transcripción fallida).
5. **`hyperframes check --caption-zone` y contraste WCAG** (hyperframes `lint-validate-inspect.md:30-115`):
   comprobar primero que 0.9.27 lo soporta.
6. **Zonas seguras por plataforma** (explainroo `src/project.js:33-35`, fracciones arriba/der/abajo/izq):
   TikTok .125/.20/.34/.11 · Shorts .15/.12/.35/.06 · Reels .14/.11/.35/.06. Hoy usamos una banda única.

## Para los clips de directos (Kick/Twitch)

Ninguno de los repos ingiere directos: el grabador con búfer y el chat (IRC de Twitch, websocket de Kick)
hay que hacerlos. Lo reutilizable, todo MIT:

- **Ventanas de 30 s cada 15 s, normalizadas al p95** con piso (ghost1412/shorts-generator
  `engine/game_moments.py`): `action = 0.4·pico + 0.35·movimiento + 0.25·dinámica`,
  `story = 0.5·texto + 0.25·dinámica + 0.25·movimiento`. Añadir `chat_n` (mensajes/s al p95 y su salto
  sobre una EMA).
- **Silencio y luego estallido:** `log1p(|energía − EMA|)·3` (mismo repo, `engine/analysis.py:622`).
- **Risa sin modelo:** ritmo 3–8 Hz de la envolvente + planitud espectral 300–4000 Hz
  (`engine/signals.py:17-82`). Peso bajo en juegos: los disparos la imitan.
- **Re-ranking con Ollama local** (`engine/highlight_rank.py`): puntaje 1–10, `complete`, `extend_end`,
  `trim_start`; mezcla 60 % LLM / 40 % señales; 8–60 s.
- **Rúbrica de ganchos en portugués, fácil de pasar al español** (pedroxcardoso/maquina-cortes-gta
  `references/ganchos.md`): descartar < 6/10; empezar 0,2 s antes del gancho.
- **Bordes:** inicio a comienzo de frase ±1,5 s, fin a `.?!` ≤ 3 s + 0,3 s, luego al silencio más cercano
  (AgriciDaniel/claude-shorts `scripts/snap_boundaries.py`). Umbral relativo al ruido, nunca dB fijos
  (louisedesadeleer/cut-video: piso p10 + 6 dB; proteger risas > piso + 10 dB).
- **Duplicados:** rechazar solapes > 50 % con uno mejor (WhiteTowerAI/cut-as-code).
- **Facecam y 9:16:** YuNet ONNX de OpenCV (230 KB), confianza ≥ 0,8 (las caras falsas de juegos dan
  0,6–0,75), EMA 0,3, salto > 0,2 del ancho = corte (shorts-generator `engine/analysis.py:356-433`).
  Diseño mitad streamer / mitad juego con subtítulo en la costura (maquina-cortes-gta `estilo-metade-metade.md`).
- **Cortar el VOD sin recodificar** al keyframe (técnica de LosslessCut) para sacar el tramo en segundos.

## gtavi-claudecode (Bodila51, MIT) — revisión 2026-11-19

Plugin de Claude Code en Python para sacar clips verticales de directos y videos de GTA 6 (16 skills,
13 scripts). Decisiones en DECISIONES.md §21.

| Pieza | Qué hace | En Geeper |
|---|---|---|
| `moments.py` | Puntaje por segundo: sonoridad, «lo más visto», chat, palabras de emoción | **Portado** a `src/lib/momentos.ts`, puntuando sin transcribir y transcribiendo sólo candidatos; bordes a frase |
| `facecam.py` | Webcam del streamer con YuNet + bordes estáticos; seguimiento de cara suavizado | **Copiado** a `py/facecam.py` (modelo con sha256 fijo, sin descarga en ejecución) |
| `cut.py` (layout react, `game_offset`) | Cara arriba, juego abajo, esquivando overlays fijos | **Portado** a `py/reencuadre.py`; el resto de `cut.py` no (Geeper compila, normaliza y hace QC) |
| `cut.py` (máscara de insultos) | Enmascara insultos en los subtítulos | **Tomado** sólo para insultos racistas, homófobos y capacitistas, vía `mostrar` |
| `check.py` + `rule-check` | Reglas de campaña y términos prohibidos | **Portado** como regla de QC «clip» (`src/lib/clips.ts`) |
| `hook-writer` | Fórmulas de gancho y títulos de reacción | **En la skill `geeper`**, en español |
| `learning-loop` | Una prueba por día, lecturas a 12/24/72 h, sólo números reales | **Diseño de D2** (BRECHAS.md) |
| `trends.py` | Videos recientes por vistas por hora (yt-dlp) | No por ahora: útil para elegir fuentes; se puede correr aparte |
| `streams.py`, `twitch.py`, `live.py` | Directos en curso (GQL de Twitch con el Client-Id de la web), chat por IRC anónimo, grabación de directos | **Descartado**: zona gris de términos y grabar directos ajenos |
| `translate.py`, `multilang` | Traducción con Google Translate web y voz con edge-tts | **Descartado**: servicios en línea; D3 irá local |
| `campaign-finder`, `payouts.py` | Campañas pagadas de Whop y registro de pagos | No: operación del canal, no producto. Las reglas de una campaña entran con `--campania` |
| `questions-to-posts`, `secrets-map`, `cheat-codes`, `playbook` | Contenido y rutina de una página de GTA 6 | No: contenido. Sus reglas duras (sin leaks, sin «oficial», acreditar siempre, no prometer ingresos) sí están en la skill y el QC |

## open-seo (every-app, MIT) — revisión 2026-11-20

Alternativa abierta a Semrush/Ahrefs (TanStack Start en Cloudflare o Docker), commit `af3f995`. Casi todo
su valor son datos de **DataForSEO, que se paga por consulta**, y SEO de sitios web; Geeper es un estudio
de video a US$0 cuyo único sitio (`sitio/`) es la página legal para la verificación de las apps de redes.

| Pieza | Qué hace | En Geeper |
|---|---|---|
| `src/shared/audit-issues.ts` | Registro de problemas de la auditoría: gravedad, explicación y cómo arreglarlo (`missing-title`, `duplicate-title`, `missing-meta-description`…) | **Portada la idea** a `src/lib/redes/revision-texto.ts`: en el panel de publicar, cada cuenta muestra «✓ listo» o lo que la red recortaría, ignoraría o rechazaría, con botón de arreglo cuando se puede (YouTube: `<` `>`, título > 70 que se corta, sin descripción, descripción > 5000 bytes, > 60 hashtags; TikTok e Instagram: 2200 caracteres; Instagram: > 30 hashtags o > 20 menciones bloquea). Avisa de títulos repetidos en la cuenta, en cualquier proyecto (`/api/cuentas/titulos`) |
| Skills `keyword-research`, `keyword-clustering` | Elegir temas por lo que la gente busca y por encaje con el negocio, no por volumen; no inventar métricas | **Hecho con fuente gratis**: «Lo que busca la gente en YouTube» (`src/lib/busquedas.ts`, autocompletado de YouTube, sin clave; país en `GEEPER_PAIS_BUSQUEDAS`, por defecto MX) al escribir el tema en /nuevo y en el radar de tendencias. No es API oficial: si falla, no se muestra nada. Sale a Google sólo el texto del tema. Sin volúmenes: open-seo los saca de DataForSEO (de pago) |
| Auditoría de sitio, Lighthouse, backlinks, rank tracking, visibilidad en IA, SEO local | Rastreador propio + DataForSEO + LLMs | **No**: SEO web o de pago; `sitio/` no compite en búsquedas |
| MCP y skills de SEO para agentes | Herramientas sobre su API | **No**: requieren una instancia de OpenSEO con clave de DataForSEO |
| Skills internas (`papercuts`, `test-audit`, `merge-ready`, `deslop`) | Flujo de trabajo del repo | **No por ahora**: `deslop` ya lo cubre la skill `humanizer`; las otras están atadas a su CI y su facturación |

## Descartado

- **Remotion:** licencia de empresa paga para algunas organizaciones; Hyperframes ya cubre lo mismo con Apache-2.0.
- **Revideo:** MIT pero con telemetría PostHog; la API de render ya la cubre la cola.
- **MoviePy:** más lento que ffmpeg directo y suma Python al render sin ganancia.
- **Editly:** sin cambios desde mayo de 2025, un solo mantenedor. Queda la idea de un «borrador rápido»
  sin Chrome.
- **Motion Canvas:** sin versión estable desde 2024.
- **Manim** (MIT, activo): no ahora; sirve más adelante para clips de diagramas en Dimerso como «clip propio».
- Todo lo que usa ElevenLabs, HeyGen, Gemini, Veo o Google CSE: de pago.
- **Voz a ritmo 1,2 para shorts** (explainroo): choca con la regla de ≤ 17 car./s (DECISIONES §3).

## storytold (FilmCraft, EffectCraft, SoundCraft, craft-libs) — revisión 2026-11-18

Apps de escritorio en Rust (egui/wgpu), MIT o Apache-2.0, sin telemetría ni llamadas a IA de pago.
Todas en **alfa** según su propio ROADMAP: FilmCraft «~56 % listo», EffectCraft «~45 %», SoundCraft
«~40 %», con Linux/WSL poco probado. Tienen CLI sin interfaz (`<app>-cli`) y servidor MCP. Su exportación
usa códecs propios en CPU (H.264 sin NVENC en EffectCraft, ~0,7× tiempo real en FilmCraft): **no
reemplazan** a Hyperframes + ffmpeg/NVENC como motor de render.

**Hecho:** exportar a OpenTimelineIO (`src/lib/otio.ts`, `GET /api/proyectos/<id>/otio`,
`scripts/exportar-otio.ts`) para terminar a mano en FilmCraft, DaVinci Resolve o Premiere. Reproduce la
línea de tiempo del render (la primera escena cubre la entrada; un clip más corto que su escena vuelve a
empezar). Validado con la biblioteca oficial `opentimelineio` 0.18.1 en los 5 proyectos (pistas de igual
duración, assets existentes, rangos dentro del medio) y convertido a FCP 7 XML y EDL con los adaptadores
oficiales. No viajan: subtítulos animados (van en el `.srt`), chip, zoom de cortes, tarjeta final, fondo
desenfocado y ducking.

**Para después (rutas dentro de cada repo):**
- **Plantillas de motion graphics de EffectCraft:** `effectcraft-cli render --template x.ectemplate
  --values v.json --format prores --channels rgba` (docs/agents.md:385-397) para intros, rótulos y
  tarjetas con brillo, partículas o desenfoque de lente que CSS no logra; se superponen con ffmpeg. Requiere
  instalar Rust o un binario publicado para Linux, y fijar la versión.
- **Seguimiento de cara para la facecam:** EffectCraft `crates/track/src/face.rs` (MediaPipe Face
  Landmarker en Rust puro) y el suavizado gaussiano de trayectoria de FilmCraft
  `crates/render/src/vfx/temporal.rs:346`. El «Auto Reframe» de FilmCraft no detecta caras: no sirve.
- **Recorte de fondo y segmentación locales:** `craft-ai-integrations` (BEN2 + ViTMatte y SAM 2.1 sobre
  rten en CPU, `.onnx` de los autores): texto detrás del streamer.
- **Análisis de audio para momentos fuertes:** `soundcraft/crates/dsp` (`meter.rs:139` R128 con pico
  real 4×, `offline.rs:715` silencios, `offline.rs:580` transitorios). Sólo depende de rustfft.
- **Detector de cortes de escena** portable a TS: FilmCraft `crates/render/src/scene.rs:62-95`
  (rejilla de luma 32×18 + histograma de 16 niveles por canal, umbral frente a la mediana local).
- **Semántica de edición** (ripple, roll, slip, slide) como especificación: FilmCraft
  `crates/edit/src/lib.rs:310-1262`; base de tiempo exacta de 254 016 000 000 ticks por segundo.
- **Subtítulos y listas de corte:** `craft-libs/crates/captions` (SRT, VTT, ASS, TTML con ajuste a
  fotograma) y `crates/timeline` (FCPXML 1.9–1.11, EDL, OTIO).
- **Valores de referencia de exportación:** FilmCraft `crates/export/src/presets.rs:125-160` (TikTok,
  Reels y Shorts 1080×1920 a 8–12 Mbps y −14 LUFS); los nuestros quedan por debajo con CRF 20 y SSIM 0,99.

**Descartado:** usar sus códecs o su render como motor, la UI egui o su build wasm (es la app entera, no
una biblioteca), generar `.ecproj` a mano (esquema sin publicar), `--gpu` de EffectCraft bajo WSL2, y los
demás repos de la organización (Unreal, mocap, Kinect, TTS de 2020–2023, infraestructura, `craft-skills`
vacío, `cloud-worker` en nube de pago).

### FilmCraft 0.20.1 — segunda revisión 2026-11-19 (commit `ae0a71d`)

Sigue en alfa (~56 % «listo para trabajo real»). Cambio desde la revisión anterior: la exportación
H.264/HEVC puede usar NVENC en Linux (opcional). No cambia la conclusión: el compositor sigue siendo
Hyperframes.

**Hecho: el `.otio` se abre bien en FilmCraft.** Leído contra su lector (`crates/interchange/src/otio.rs`):
- Sin `metadata.filmcraft.settings`, FilmCraft crea la secuencia en **1920×1080**: un short 9:16 abría en
  horizontal. Ahora va el bloque `SequenceSettings` completo (tamaño del formato, fps). Todos sus campos
  son obligatorios en el deserializador; si falta uno, descarta el bloque sin avisar.
- El volumen de la música y de los efectos de sonido va como `metadata.filmcraft.gain_db` (0,16 lineal →
  −15,9 dB). Antes la música entraba a 0 dB y tapaba la voz.
- El fundido se llama «Cross Dissolve», el nombre que FilmCraft reconoce; con «Fundido» lo importaba
  igual pero con un aviso. El mapeo `in_offset: 0` es correcto: el compilador arranca el fundido en el
  corte y alarga la escena anterior (`StartAtCut` en FilmCraft).
- Validado con `opentimelineio` 0.18.1 en los 3 proyectos de `~/geeper-data` y con pruebas en
  `tests/otio.test.ts`, y con el binario real 0.20.1 (tarball de Linux con SHA256 verificado, sin
  instalar): `filmcraft-cli import x.otio --save-as p.fcproj` y `filmcraft-cli --project p.fcproj inspect
  sequence` dan 0 avisos, 0 archivos sin conexión, 1080×1920 a 30 fps, música a −15,92 dB, 7 marcadores y
  la misma duración (49,5 s; el de 16:9, 1920×1080 y 42,497 s). El `.srt` entra solo en una pista de
  subtítulos (35 subtítulos).

**Hecho: botón «Terminar en otro editor»** en la página del proyecto (`src/components/panel-otro-editor.tsx`,
`GET /api/proyectos/<id>/editor`, `src/lib/paquete-editor.ts`). Baja un `.zip` con el `.otio`, el `.srt`
de la versión actual y `LEEME.txt`, una guía de 3 pasos en español (menús reales de FilmCraft en español
y de Resolve, qué no llega, qué hacer si faltan archivos). Las rutas del `.otio` van a la carpeta de red
de WSL (`file://wsl.localhost/<WSL_DISTRO_NAME>/...`): un editor en Windows no ve `/home/...`. FilmCraft
las convierte en `//wsl.localhost/Ubuntu-24.04/...` (comprobado). Fuera de WSL quedan las de Linux.
**Sin probar:** abrirlo en FilmCraft o Resolve de Windows (lo hace el dueño).

**Revisado y descartado:**
- `crates/tts-text` (normalizar números, fechas y siglas antes del TTS): el español se recortó de su
  alcance, sólo hace inglés. Kokoro en español ya fonetiza con espeak-ng.
- Textos en pantalla como texto editable en FilmCraft: allí son capas gráficas (esquema v12,
  `LayerExtra`), no generadores. Siguen yendo como marcadores con su duración.
- Opacidad, movimiento y color como efectos de FilmCraft: la lista de `metadata.filmcraft.effects`
  **reemplaza** los efectos intrínsecos del clip. No se escribe sin poder probarlo con el binario.
- Su servidor MCP (`filmcraft-cli mcp`): útil para que un agente termine la pieza en FilmCraft, pero
  no hace falta para Geeper; las convenciones (anotaciones de sólo lectura, argumentos estrictos) quedan
  como referencia si algún día Geeper tiene MCP.

### PdfCraft 0.21.1 — revisión 2026-11-19 (commit `6de8335`)

Lector y editor de PDF en Rust (egui), MIT o Apache-2.0, sin telemetría. No trata video ni audio:
**no se integra como dependencia**. Sirven tres patrones suyos:

**Hecho:**
- **Archivos secretos verificados al leerlos** (idea de su archivo de control, que rechaza enlaces
  simbólicos, archivos de otro usuario y permisos abiertos): `src/lib/redes/archivo-privado.ts`. La
  clave de cifrado y `redes.json` se abren con `O_NOFOLLOW` y se validan con `fstat` sobre el mismo
  descriptor (archivo normal, del usuario, sin permisos para grupo ni otros). Antes, una clave con
  permisos 644 se usaba igual, y un `redes.json` ilegible se tomaba como «sin redes configuradas».
  Ahora los dos casos dan error con el arreglo (`chmod 600`). Pruebas en `tests/redes-nucleo.test.ts`.
- **Informe por paso** (como `pdfcraft-cli run --script --report`): `scripts/proponer.ts` dice en qué
  paso y por qué falla una lista de ediciones, omite los siguientes, no aplica nada y sale con código 1.
  `--informe` devuelve un solo JSON para agentes.

- **Aviso en lenguaje simple + «Protegerlos ahora»** en Cuentas y Sistema (`components/aviso-privados.tsx`,
  `lib/redes/privados.ts`, `POST /api/sistema/privados`): deja en 600 la clave y `redes.json` sólo si
  son archivos normales del usuario (nunca un enlace ni uno ajeno). Cuentas ya no dice «Faltan las
  credenciales» cuando el problema son los permisos.
- **Revisión guiada de palabras dudosas** (su «OCR Verify»), en la edición por texto: color según la
  confianza con leyenda (< 60 % dudosa, 60–80 % poco segura), «▶ Escuchar» de cualquier selección y
  «Revisarlas una por una»: suena el tramo y se elige «Sí, suena bien» (edición `confirmarPalabras`,
  confianza 1: deja de contar en el QC), «Recortarla», «Saltar» o «Terminar»; al acabar ofrece seguir
  con la próxima escena.
- **Buscador de acciones** (Ctrl+K / ⌘K o «Buscar acción» en la barra; `components/paleta.tsx`): ir a
  cualquier página y, dentro de un proyecto, renderizar, descargar, revisar dudosas, acortar silencios,
  quitar muletillas, cambiar formato o plantilla, alinear al ritmo, regenerar la voz o volver a la
  versión anterior (`components/acciones-proyecto.ts`). Busca sin tildes y por sinónimos.

**Para después:**
- **MCP de Geeper** con su diseño: una sola tabla de herramientas con JSON Schema compartida por la CLI
  y el MCP, que sólo arranca cuando la pide un agente (stdio, sin puertos), `--root` para limitar los
  archivos y `--compact` (unas diez herramientas más `tool_search` y `tool_call`). Las ediciones Zod ya
  son esa tabla.
- **OCR de texto deforme en imágenes generadas** (Q3 de BRECHAS.md): su `crates/ocr` (ocrs sobre rten,
  con Tesseract opcional y confianza por palabra). Requiere Rust o Tesseract; ninguno está en esta PC.

**Descartado:** el motor de PDF, la UI egui y el build wasm (no hay PDFs en el flujo de Geeper); sus
fuentes (Inter, JetBrains Mono, Dancing Script, OFL), porque las plantillas no las usan; y su auditoría
de licencias con sha256 (`LICENSES.toml`, `xtask license_check`), porque Geeper ya registra procedencia
y licencia por asset y el QC bloquea las no comerciales (Q1).

### LightCraft 0.21.1 — revisión 2026-11-19 (commit `976f52a`)

Revelador RAW y biblioteca de fotos en Rust puro (egui/wgpu, ~385 000 líneas), MIT o Apache-2.0, con
CLI sin interfaz y servidor MCP. Es de fotografía fija: **no se integra como dependencia** (sin Rust en
esta PC, y su export de video es AV1 por CPU, sin audio). Sirve una pieza y un patrón:

**Hecho: reencuadre automático por cara (E4 de BRECHAS.md).** De `crates/faces/src/known.rs` se toma el
manifiesto de YuNet 2023mar: dirección **fijada a un commit** de opencv_zoo, tamaño (232 589 bytes),
SHA-256, licencia (MIT) y su advertencia (entrenado con WIDER FACE, cuyos términos no cubre la licencia
de los pesos; detecta, no identifica). Su patrón de descarga (`crates/fetch`: archivo temporal, hash
comprobado, rename; si no coincide, se descarta) está en `src/lib/caras.ts`. La inferencia no es su
intérprete Rust sino `cv2.FaceDetectorYN` del venv `geeper-clips` (OpenCV 4.14), el mismo modelo.
- `py/caras.py`: hasta 40 muestras por clip, cara principal = mayor área × puntaje (≥ 0,8), EMA 0,3 que
  se reinicia si la cara desaparece, mediana; guarda `asset.foco` (centro, ancho, cobertura, dispersión).
- Compilador: si el clip no fija ancla y la cara es estable (en ≥ 50 % de las muestras, ≤ 60 % del ancho
  visible, se mueve < ¼ de lo visible), **cubre** el cuadro con la cara centrada y a 40 % del alto, en
  vez de contener con fondo desenfocado. Sin foco, el HTML sale idéntico al de antes.
- Corre solo al importar y al subir un clip propio. Los proyectos ya importados se analizan **una vez**
  al abrirlos (`POST /api/proyectos/<id>/caras`, resultados en `<proyecto>/caras.json` por sha256, así
  restaurar una versión vieja no los vuelve a cambiar). Si algo cambia, un aviso dice qué escenas y
  ofrece «Dejar como estaba». Por terminal: `scripts/analizar-caras.ts <slug> [--aplicar]`.
- Interfaz «¿Qué se ve?» por escena (`src/components/selector-encuadre.tsx`): la miniatura con un
  recuadro de lo que entra en el video y la cara marcada; opciones en palabras simples (Automático,
  Seguir la cara, El centro, La parte de arriba/abajo, Todo con fondo borroso), sólo las que cambian
  algo en ese clip; pasar el mouse o el foco muestra el recorte antes de elegir. El recuadro sale de
  `visibleDe`, la misma función que usa el compilador.
- Medido: 5 clips de paisaje en 4,7 s (sin cara, correcto). Un 16:9 con la cara a la derecha (x 0,728)
  renderizado en 9:16 con Hyperframes 0.9.27 deja la cara en x 0,487 del cuadro final.
- Pendiente: seguimiento dinámico (hoy es un punto fijo por archivo; para facecams que se mueven hace
  falta animar `object-position` con la trayectoria suavizada) y el foco por rango de tiempo, no por
  archivo entero.

**Para después:**
- **Manifiesto de modelo con licencia y aceptación** (`crates/faces/src/manifest.rs`, docs/faces.md): id,
  URL fijada, SHA-256, tamaño, licencia, «¿uso comercial?» (sí / no / desconocido) y procedencia de los
  datos de entrenamiento. Sirve para P1 de BRECHAS.md (registro de modelos con VRAM medida) cuando
  entren Chatterbox, Qwen3-TTS o Wan: hoy `src/lib/modelos.ts` sólo guarda la huella.
- **Herramientas MCP compartidas** (`command_list` / `command_run`, docs/mcp.md): misma convención que
  FilmCraft; junto a lo anotado en PdfCraft, es el diseño a seguir si Geeper tiene MCP.
- **Grano de película independiente de la resolución** (docs/grain.md): si una plantilla pide grano,
  primero mirar el bloque de grano de `hyperframes-registry`.

**Descartado:** SAM 3 (segmentación; licencia propia de Meta, revisar antes de usar), relleno PatchMatch,
reconocimiento facial (SFace, AuraFace: Geeper no necesita identificar a nadie), RAW, lentes, HDR,
panoramas, geocodificación, la presentación de diapositivas (Hyperframes ya hace más) y la pila de
actividad (la página Trabajos cumple ese papel).

### VectorCraft 0.24.1 — revisión 2026-11-19 (commit `54f58ff`)

Editor de ilustración vectorial en Rust (egui/wgpu), MIT o Apache-2.0, sin telemetría ni IA de pago.
Alfa (~65 % «listo para trabajo real» según su ROADMAP). Trae `vectorcraft-cli` sin ventana: `convert IN
OUT` (abre SVG, PDF, `.ai`, EPS, DXF, EMF, Affinity y rasters; escribe SVG, PDF, PNG, JPEG, WebP, PSD…),
`run --commands pasos.json --export x.svg` (la misma API de comandos que su MCP, con renderizador en CPU),
`info` y `mcp --headless` con `--automation-read-root/--automation-write-root`. No trata video: **no
reemplaza** a Hyperframes ni a PhotoCraft (las portadas, D1, ya van por PhotoCraft).

**Hecho:**
- **SVG como imagen** (`src/lib/svg.ts`): logos, rótulos y superposiciones vectoriales se ven nítidos
  en 9:16, 16:9 y 1:1 sin un PNG por formato. Entran por «subir clip propio» (pista libre o escena) y en
  `plantilla.marca.logo`. El tamaño sale de `width`/`height` en px o del `viewBox` (ffprobe no lo da). No
  se sanea: se **rechaza** el SVG con scripts, `foreignObject`, eventos `on…`, DOCTYPE o entidades, CSS
  con `@import`, `image-set()`, escapes `\`, o cualquier `href`/`url()` que no sea `#id` o un PNG/JPEG/WebP
  en base64; todo eso también con las entidades decodificadas (`attributeName="hr&#x65;f"` es un href).
  Además se sirve con `Content-Security-Policy: … sandbox`. Los SVG no pasan por la detección de caras.
  Revisión de bypasses con Nemotron (`razonar`): de 14 propuestas, 4 eran reales (entidades en valores y
  en `url()`, escapes CSS, `image-set` con cadena) y quedaron cubiertas con pruebas; el resto no pasaba
  el filtro o no tiene efecto en Chrome (entidades en nombres de etiqueta o atributo).
- **Regla de QC «Resolución de imágenes y clips»** (aviso), del chequeo *Image Resolution* de su
  Production Preflight (docs/production-preflight.md): ampliación efectiva de cada clip raster en la
  salida, con cubrir/contener y el zoom máximo del movimiento. Umbral 2×: los clips de MPT (832×1216)
  en 9:16 dan 1,58× y pasan; un logo PNG chico a pantalla completa, no. Pruebas en `tests/svg.test.ts`.
  Se llama «Nitidez de imágenes y clips» y dice en palabras qué escena se verá borrosa y de qué tamaño
  mínimo tiene que ser el reemplazo (`src/lib/nitidez.ts`).
- **Logo de la marca desde /plantillas**: lo lleva la sesión de la paleta (`api/plantillas/[slug]/logo`,
  `src/lib/imagen-subida.ts`, que valida los SVG con `revisarSvg`). Notas que le dejo: avisar si un logo
  raster mide menos de 53 px de alto (así se muestra en 9:16: `marcaFs` 44 × 1,2), un botón «Quitar
  logo» y nombre con hash del contenido para no pisar el de renders viejos (ya lo hace).

- **Instalado y conectado** (2026-11-19): `~/dev/video-tools/vectorcraft/0.24.1`, enlace `actual`,
  `VECTORCRAFT_CLI`/`VECTORCRAFT_VERSION` en `src/lib/rutas.ts`, chequeo en el doctor y botón «Instalar con
  un clic» en Sistema (`src/lib/instalar-craft.ts`: el procedimiento de PhotoCraft con la app como
  parámetro; el de PhotoCraft puede pasarse a éste).
- **Subir un logo o rótulo `.ai`, `.pdf`, `.eps`, Affinity, DXF o EMF** como clip propio o superposición:
  se convierte a SVG con el texto en contornos (`convert … --outline-text`, siempre `--safe-mode`, ~10 ms)
  y entra como SVG; lo que VectorCraft avise (p. ej. una fuente que faltaba) se muestra al subirlo y el
  historial dice «convertido a SVG» (`src/lib/vectorcraft.ts`, `src/lib/formatos-vector.ts`).
- **`vectorizar()`** (Image Trace, `imageTrace.makeAndExpand`): un logo PNG plano pasa a pocos trazos.
  En el proyecto, cuando el QC avisa que una imagen se verá borrosa, aparece «Vectorizar … (si es un
  logo)» junto al aviso (sólo para imágenes, no videos, y sólo si siguen en el proyecto): reemplaza la
  imagen por el SVG en todos sus clips como versión nueva, que se deshace desde Historial
  (`api/proyectos/[id]/vectorizar`, `cambiarAsset` en `src/lib/nitidez.ts`). El MCP queda sin registrar
  (decisión del 2026-11-19: no hay flujo que lo pida).
- Pruebas contra el binario real en `tests/vectorcraft.test.ts` (se saltan si no está instalado).
- **Pendiente para la sesión del logo de plantillas:** `guardarImagenSubida` todavía no acepta `.ai`/`.pdf`
  /`.eps`; con `esVector()` y `aSvg()` es una línea.

**Para después:**
- **Rótulos y tercios inferiores vectoriales** diseñados por Claude con el MCP sin ventana, encerrado en
  la carpeta del proyecto: `claude mcp add vectorcraft -- ~/dev/video-tools/vectorcraft/actual/bin/vectorcraft-cli
  mcp --automation-read-root ~/geeper-data/<slug>/assets --automation-write-root ~/geeper-data/<slug>/assets`.
- Chequeo de fuentes faltantes del mismo Preflight (`document.preflight`): aplicaría a los textos en
  pantalla si una plantilla usa una tipografía que Chrome no tiene.

**Descartado:** su render o su UI como motor (no hace video), los efectos 3D, malla de degradado, perspectiva
y cotas (sin uso en shorts), el build wasm y escribir `.vectorcraft` a mano (es JSON documentado, pero la
API de comandos es la vía estable).

### DesignCraft 0.21.0 — revisión 2026-11-19 (commit `a354990`)

Maquetación de páginas (revistas, libros) en Rust puro (egui, vello_cpu), MIT o Apache-2.0, sin
telemetría, con `designcraft-cli` sin ventana y servidor MCP. Sale a PNG, PDF/X, EPUB, IDML y PPTX: no
tiene tiempo, audio ni video, así que **no se integra como dependencia**. Lo que sirve es su tipografía.

**Hecho: líneas equilibradas en subtítulos, textos en pantalla y tarjeta final.** De su «Balance Ragged
Lines» (`crates/compose/src/breaker.rs:1065`): conservar el número de líneas del corte voraz, pero con la
medida más estrecha que lo mantiene, para que las líneas queden parejas. `lineasDePalabras` en
`src/lib/subtitulos.ts` lo hace como programación dinámica sobre caracteres (costo Σ largo²), y además
evita cerrar una línea con artículo, preposición o conjunción («la / casa») si el costo en equilibrio es
razonable (penalización max²/8; con puntuación pegada, «que,», sí puede cerrar). Esa regla es una pauta
habitual de subtitulado en español, no viene de DesignCraft.
- Como el número de líneas no cambia, no cambian el reparto en grupos (`partirEnDosLineas`,
  `suavizarRitmo`) ni el conteo de líneas del QC; el largo máximo por línea sólo puede bajar.
- El compilador pinta cada línea de subtítulo como un `.linea` propio, así lo que se ve es lo que mide
  el QC (antes el navegador partía la pastilla a su manera). Los textos en pantalla toman el ancho de las
  líneas equilibradas y llevan `text-wrap: balance`, igual que el título de la tarjeta final.
  `VERSION_COMPILADOR` pasa a `compilador-hf-v3` (cambia el HTML, se recompila la vista previa).
- Verificado en los 5 proyectos de `~/geeper-data` con `hyperframes snapshot` (tipografías reales):
  «fundamentales para la / seguridad marítima,» y «visuales que guían a / los barcos en aguas poco» en dos
  líneas parejas, y «GTA VI / SHORTS» en la tarjeta final. Pruebas en `tests/subtitulos.test.ts`.

**Hecho (segunda tanda, 2026-11-19): lo que necesitaba interfaz, pensado para quien no sabe de diseño.**
- **Editor visual de plantillas** (`src/components/editor-plantilla.tsx`): reemplaza el cuadro de JSON por
  campos normales (marca, logo, seis colores con nombre y para qué sirven, letra de una lista de Google
  Fonts que Hyperframes descarga sola, cierre, música) con vista previa en vivo (video claro u oscuro), barra
  de guardar fija y aviso de cuántos proyectos la usan. «Duplicar» crea una copia para probar sin afectarlos.
  El JSON queda en «Avanzado». Rutas: `PUT /api/plantillas/<slug>` acepta `{ nombre, datos }`,
  `POST /api/plantillas` duplica, `POST /api/plantillas/<slug>/logo` guarda el logo en
  `~/geeper-data/plantillas/<slug>/`.
- **Colores desde el logo o una foto** (`src/lib/colores-marca.ts`, `src/lib/paleta.ts`, `POST /api/paleta`):
  el median cut de `color_theme.rs:71-127`, con una diferencia: corta donde queda menos varianza, no en la
  mediana, porque la mediana promediaba dos colores del logo en uno que no existía (probado). ffmpeg lee
  PNG, JPG, WebP y SVG (librsvg). Propone qué color va en cada rol: el principal es el más característico de
  la marca; el secundario, uno que se lea sobre el cierre. Está en el editor de plantillas y en Anuncios
  («Leer la marca desde su web» → sacar colores del logo).
- **Legibilidad con arreglo de un toque** (contraste WCAG contra el peor caso, video claro u oscuro debajo):
  subtítulos, palabra que suena, botón final y título final, con «Arreglar» (sube la opacidad del fondo o
  ajusta el color lo mínimo). DesignCraft no lo tiene; cierra el contraste WCAG pendiente de BRECHAS Q2
  para las plantillas. Las letras del botón final y de los títulos en pantalla se eligen solas en el
  render (`textoSobre`): la tinta si se lee (≥ 3:1), si no negro o blanco. La plantilla Dimerso tenía el
  botón ilegible (1,1:1); GTA VI no cambia (3,4:1).
- **Variantes de anuncios en una tabla** (su combinación de datos): ver `docs/ANUNCIOS.md` §9.
- **Pasos encadenados en `proponer.ts`** (sus guiones con `$N.ruta`, `src/lib/encadenar.ts`): `"$1.id"`,
  `"$ultimo.id"`, `"${1.id}"` y `$$`; el informe dice qué creó cada paso. Numerado desde 1, como el informe
  (DesignCraft cuenta desde 0).
- Revisión con Nemotron (`razonar`) de las partes delicadas: de 10 hallazgos, 4 eran reales y quedaron
  arreglados con prueba (una ruta de imagen `anuncios/<id>/../../geeper.db` salía de la carpeta de la
  campaña; claves heredadas como `__proto__` en las referencias; encabezados repetidos al pegar; fórmulas
  de Excel en el CSV exportado de Anuncios). El resto ya estaba cubierto o no aplica a una app local.

**Para después:** el preflight en vivo y el diseño del MCP ya están anotados arriba (VectorCraft y PdfCraft).

**Descartado:** el compositor de párrafos (Knuth–Plass con estiramiento de espacios, letras y glifos) y la
partición con guion, incluidos los patrones en español de `hypher`: un subtítulo no se parte con guion y
no se justifica; sus fuentes (Inter, Source Sans 3, Source Serif 4, JetBrains Mono, OFL), porque
Hyperframes ya descarga y fija las tipografías de las plantillas al renderizar; el render, PDF/X, EPUB,
IDML, INDD y PPTX (no hay salida impresa en Geeper); el soporte CJK y árabe; la UI egui y el build wasm;
y la escritura atómica (Geeper ya la tiene en `src/lib/archivos.ts`).
