# Modelos, motores y material de terceros

Lo que Geeper usa, de dónde sale, su licencia y si permite uso comercial. Cada asset de un proyecto
guarda su licencia en `geeper.json` y en la tabla `Asset`; el QC avisa (sin bloquear) cuando una es
«desconocida» o «revisar». Revisado el 2026-11-17.

## Modelos

| Modelo | Para qué | Dónde corre | Origen | Licencia | ¿Comercial? |
|---|---|---|---|---|---|
| Z-Image-Turbo (bf16) | Imágenes de cada escena (vía MPT, `mpt-image-server`) | GPU, Docker | [Tongyi-MAI/Z-Image-Turbo](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo) | Apache 2.0 | Sí |
| RealVisXL V5 Lightning | Imágenes (alternativa de MPT, SDXL) | GPU, Docker | Civitai / Hugging Face (SG161222) | OpenRAIL++-M | Sí, con las restricciones de uso de OpenRAIL |
| Qwen3 14B (`qwen3:14b`) | Guion y palabras clave (vía MPT, `mpt-ollama`) | GPU, Docker | [Qwen/Qwen3-14B](https://huggingface.co/Qwen/Qwen3-14B) | Apache 2.0 | Sí |
| Kokoro-82M (voz `ef_dora`) | Voz (MPT `mpt-kokoro` y `hyperframes tts`) | CPU | [hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) | Apache 2.0 (pesos); el fonemizador espeak-ng es GPLv3 y corre como proceso aparte | Sí |
| whisper `medium` (ggml) | Tiempos por palabra (`hyperframes transcribe`, whisper.cpp sin CUDA) | CPU | OpenAI Whisper / whisper.cpp | MIT | Sí |
| faster-whisper `large-v3` | Subtítulos internos de MPT (Geeper no los usa) | CPU, Docker | OpenAI Whisper / SYSTRAN | MIT | Sí |
| Wan 2.2 TI2V-5B | Plano generativo (M5, opcional) | GPU | [Wan-AI/Wan2.2-TI2V-5B-Diffusers](https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B-Diffusers) | Apache 2.0 (verificado en la ficha descargada, ver ESTUDIO.md) | Sí |

## Motores y bibliotecas

| Pieza | Licencia | Cómo la usa Geeper |
|---|---|---|
| MoneyPrinterTurbo 1.3.10 | MIT | API HTTP en `127.0.0.1:8080` |
| Hyperframes 0.9.27 (fijado) | Apache 2.0 | CLI (`npx hyperframes@0.9.27`), telemetría apagada |
| GSAP 3.15 | Licencia estándar de GSAP (sin costo, también comercial) | Lo carga la composición de Hyperframes |
| ffmpeg 6.1 (Ubuntu) | LGPL/GPL según build | Binario aparte (`~/.local/bin/ffmpeg`) |
| OpenMontage | AGPLv3 | Sólo M5, como proceso aparte por CLI; Geeper no importa su código |
| Next.js, React, Prisma, Zod, better-sqlite3 | MIT / Apache 2.0 | Dependencias de la app |

## Material

| Material | Licencia | Nota |
|---|---|---|
| Música de `MoneyPrinterTurbo/resource/songs` | **Desconocida** | El README de MPT dice que viene de videos de YouTube («si infringe, bórrala»). La plantilla «GTA VI Shorts» la usa para no cambiar el canal; el QC avisa en cada render. Ver `docs/DECISIONES.md`. |
| Tipografías Archivo Black, Montserrat, Inter | SIL Open Font License | Las resuelve Hyperframes |
| Clips subidos por la persona | «propia» | La persona responde por ellos |

**Nada de material de Rockstar** (logos, personajes, capturas, música) en ninguna plantilla.
