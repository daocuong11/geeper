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
