# Prompts para otros agentes

Encargos listos para pegar en una sesión nueva de Claude Code abierta en
`~/dev/dimerso/products/geeper`. Cada uno es autosuficiente. Escritos el 2026-11-18.

Reglas comunes (están en `docs/ENCARGO-MVP.md` y en `~/.claude/CLAUDE.md`; el agente debe leerlas):
- No tocar los contenedores `supabase_*_farol` ni `farol-dev-redis`. Nunca `docker system prune`,
  `docker volume prune` ni `docker compose down -v`. Sin `sudo`.
- Un trabajo de GPU a la vez, siempre con `~/dev/video-tools/bin/gpu-lock` (o `con-telemetria`, que
  además registra temperatura y potencia). Pedir permiso antes de la primera generación con GPU de la
  sesión y avisar que se guarde el trabajo: Windows se ha reiniciado durante generaciones.
- US$0: sólo modelos locales con licencia que permita monetizar.
- Commits como `saihdez`, sin push. Responder en español con tuteo.

---

## 1. Terminar la comparativa de modelos (después de reiniciar Windows)

```
Lee MODELOS.md (sección «Comparativa de modelos locales») y ~/dev/video-tools/ESTUDIO.md. Faltan dos
comparaciones que quedaron a medias porque la actualización del driver de NVIDIA (621.24) dejó a WSL sin
CUDA hasta reiniciar.

1. Verifica la GPU: `nvidia-smi` en WSL y `docker exec mpt-ollama nvidia-smi`. Si Docker no ve la GPU,
   pide al usuario que reinicie Docker Desktop (no lo hagas tú: afecta a Farol).
2. Imágenes: `source ~/dev/video-tools/estudio.sh && cd ~/dev/video-tools/pruebas/modelos-2026-11 &&
   con-telemetria img gpu-lock python imagenes.py ./imagenes`. Compara Z-Image-Turbo (copia bf16 local
   en ~/dev/video-tools/modelos/z-image-turbo-bf16) con FLUX.2 klein 4B (hf-cache), 6 prompts, misma
   semilla, 864x1536. Arma una hoja de contacto lado a lado con ffmpeg (hstack/vstack) y evalúala tú y
   con Nemotron `vision` (no_free). Criterio: fotorrealismo, fidelidad al prompt, manos/caras, tiempo y VRAM.
3. Voz: venv ~/dev/video-tools/venvs/qwen3-tts (torch cu128 + qwen-tts). `con-telemetria voz gpu-lock
   ~/dev/video-tools/venvs/qwen3-tts/bin/python voz.py ~/geeper-data/los-faros-en-la-era-del-gps-8143b1/geeper.json ./voz`.
   Compara con la voz Kokoro del mismo proyecto (assets/voz-*.mp3): caracteres por segundo (la regla
   del QC es ≤ 17 car./s en subtítulos), tiempo de generación, VRAM, inteligibilidad (transcribe con
   `npx hyperframes@0.9.27 transcribe <copia del wav> --engine whisper --model medium --language es --json`
   en una carpeta temporal: escribe transcript.json junto al audio) y naturalidad (Nemotron `multimedia`
   escucha los dos audios; el usuario decide al final escuchándolos).
4. Repite un short completo de MPT con gemma4:26b (`~/dev/MoneyPrinterTurbo/logs/run-test.sh
   --video-subject "Los faros más extraños del mundo"`) y confirma que las 5 imágenes se generan
   (en la corrida anterior el driver se reinstaló a mitad y sólo salió 1) y cuánto tarda frente a ~3 min con 12b.
5. Actualiza la tabla de MODELOS.md con lo medido y haz commit. Si Qwen3-TTS gana con claridad, NO lo
   integres todavía: propón el plan (motor «qwen3» en src/lib/voz.ts y plantillas) y espera al usuario.
```

## 2. Clips automáticos de directos (Kick/Twitch)

Completa antes las tres respuestas del dueño entre corchetes.

```
Lee docs/PRODUCTO.md, docs/HEREDADO.md (sección «Para los clips de directos») y README.md. Geeper ya
genera, edita (vista previa en vivo, OTIO) y publica shorts. Vamos a añadir clips de directos.

Respuestas del dueño: directos [propios / de terceros con permiso / ambos]; redes primero [...];
relación con la fábrica de MPT [convive / reemplaza].

Objetivo del primer hito (sin GPU salvo para el render final):
- Grabar un directo de Kick o Twitch con streamlink (o un VOD con yt-dlp) en segmentos de 10 min, sin
  recodificar, en ~/geeper-data/directos/<canal>/<fecha>/.
- Leer el chat en paralelo (Twitch IRC anónimo `justinfan`; Kick por su websocket público) y guardar
  mensajes por segundo.
- Puntuar ventanas de 30 s cada 15 s, normalizadas al p95 con piso: energía de audio y su salto sobre una
  EMA (silencio → estallido), risa (ritmo 3–8 Hz + planitud espectral, peso bajo en juegos), movimiento
  (diferencia de cuadros a 2 fps en 96x54), mensajes de chat por segundo y su salto. Fórmulas y archivos
  de referencia en docs/HEREDADO.md (ghost1412/shorts-generator, MIT).
- Transcribir sólo las ventanas candidatas con Parakeet (`npx hyperframes@0.9.27 transcribe <wav>
  --engine parakeet --json`, SIN --language o cae a whisper) y re-puntuar con Ollama gemma4:26b
  (JSON: score 1–10, complete, extend_end, trim_start); mezcla 60 % LLM / 40 % señales.
- Ajustar bordes a frase y silencio (inicio a comienzo de frase ±1,5 s, fin a .?! ≤ 3 s + 0,3 s),
  15–60 s, descartar solapes > 50 % con uno mejor.
- Cada clip se convierte en un proyecto de Geeper (geeper.json con el tramo del VOD como clip visual y
  de audio) para editarlo y publicarlo con lo que ya existe. Facecam y 9:16 en un segundo hito.
- Cola: nuevos motores en worker/ejecutores.ts; nada bloquea el worker. Tests con un VOD corto de
  prueba. Coordina con otras sesiones antes de tocar src/lib/esquema.ts o compilador.ts (ListAgents).
```

## 3. Plantillas de motion graphics con EffectCraft

Necesita que el usuario autorice instalar Rust (`rustup`, sin sudo) y compilar código de terceros en alfa.

```
Lee docs/HEREDADO.md (sección storytold). Instala Rust con rustup (perfil minimal) y compila sólo
`effectcraft-cli` de github.com/storytold/effectcraft fijando el commit, en ~/dev/vendor/effectcraft.
Verifica que corre en WSL sin GPU (`--gpu` no). Crea una plantilla .ectemplate de tarjeta final con brillo
y partículas, renderízala con `effectcraft-cli render --template x.ectemplate --values v.json --format
prores --prores 4444 --channels rgba` y compara con la tarjeta final actual de Hyperframes (hoja de contacto
y tiempo). Si aporta, propón cómo superponerla con ffmpeg en src/lib/render.ts sin tocar el compilador.
No la integres sin aprobación.
```
