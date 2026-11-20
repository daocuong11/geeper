# Geeper

El estudio de video local de Dimerso: de un tema a un short terminado, **editable** y con control de
calidad. Uso interno, en esta PC, US$0 al mes. Ver `docs/PRODUCTO.md` (qué es y hacia dónde va),
`docs/DECISIONES.md` (lo que cambió y por qué) y `MODELOS.md` (licencias).

## Qué hace

1. **Fábrica:** un tema (o un lote, uno por línea) → MoneyPrinterTurbo genera guion, voz e imágenes
   en la GPU → Geeper lo importa a `geeper.json` → lo compila a Hyperframes con la plantilla del canal
   → render → control de calidad.
2. **Importar** un short que MPT ya generó, sin usar la GPU (opcionalmente rehaciendo la voz).
3. **Reeditar sin GPU:** corregir subtítulos, cambiar lo que se muestra sin cambiar lo que se oye,
   quitar o reordenar escenas, poner un clip propio, cambiar de plantilla o de formato (9:16, 16:9,
   1:1) y volver a renderizar.
4. **Editar por texto:** recortar palabras de lo que se oye (se quita su audio y su tiempo), acortar
   silencios largos y quitar muletillas. Las palabras con tiempos dudosos se marcan.
5. **Efectos y capas:** transición de entrada, movimiento de cámara, velocidad y color por escena;
   textos en pantalla (título, rótulo, cita); imágenes o videos encima y efectos de sonido en su
   segundo; música alineada para que los cortes caigan en el pulso.
6. **Regenerar la voz** de una escena o del guion (Kokoro de MPT, en CPU) y realinear los subtítulos.
   Lo recortado ya no se vuelve a decir.
7. **Descargar** el render (H.264 High CRF 20, ~4 Mbps: un short de 57 s pesa ~31 MB), sus subtítulos
   `.srt` y, si se pide, un máster de archivo `.mov`, sólo si pasó el QC: −14 LUFS y pico ≤ −1 dBTP
   (con reintento del limitador si el AAC lo sube), Rec.709 rango limitado,
   duración/fps/resolución/fotogramas exactos, sin congelados, subtítulos ≤ 42 car./línea, ≤ 2 líneas y
   ≤ 17 car./s, texto dentro de la banda segura (la de cada plataforma elegida en 9:16), licencias
   comerciales si el proyecto es de uso comercial, tiempos de la voz creíbles y cortes en pulso
   (aviso), más una hoja de contacto por render.

Cada guardado de `geeper.json` es una versión; se puede volver a cualquiera desde «Historial».

## Instalación

Requisitos (ya están en esta PC; `pnpm run doctor` los verifica): Node 24, pnpm 10, Docker Desktop con
los contenedores de MoneyPrinterTurbo, `~/.local/bin/ffmpeg` con NVENC, `~/dev/video-tools` (gpu-lock,
`mpt_acabado.py`, venv de OpenMontage) y Python 3.

```bash
cd ~/dev/dimerso/products/geeper
pnpm install
pnpm run setup        # genera el cliente de Prisma, crea ~/geeper-data/geeper.db y las plantillas
pnpm run doctor       # sólo lectura: dice qué falta y cómo arreglarlo
```

La primera vez, `npx hyperframes@0.9.27` se descarga solo (necesita internet).

## Uso

```bash
pnpm run dev:up       # web en http://localhost:3300 + worker, en una terminal. Ctrl+C apaga los dos.
```

- **Proyectos** (`/`): lista con estado, avance y último render.
- **Nuevo** (`/nuevo`): tema o lote, formato y plantilla. Generar usa la GPU: pide confirmar que
  guardaste tu trabajo (Windows se ha reiniciado sin aviso durante generaciones).
- **Proyecto** (`/proyectos/<id>`): vista previa «En vivo» (cada cambio guardado se ve al instante, sin renderizar) y «Último render», QC, escenas con miniatura, texto, tiempos y
  subtítulos editables, ajustes, historial y trabajos del proyecto.
- **Trabajos** (`/trabajos`): avance en vivo, log, relanzar o cancelar.
- **Plantillas** y **Sistema**: datos de cada plantilla y el diagnóstico del doctor.

Desde la terminal (útil para Claude, ver `.claude/skills/geeper/SKILL.md`):

```bash
pnpm tsx scripts/importar-mpt.ts <task_id> "<tema>" [9:16|16:9|1:1] [plantilla]
pnpm tsx scripts/proponer.ts <slug> propuesta.json [--aplicar]   # valida y muestra diferencias
pnpm tsx scripts/encolar.ts <slug> render.entregar
pnpm tsx scripts/revisar-subtitulos.ts <slug>                       # QC de subtítulos sin renderizar
pnpm tsx scripts/exportar-otio.ts <slug>                           # .otio para FilmCraft, Resolve o Premiere
```

**Clips de material largo** (VOD, video publicado o grabación propia; nunca un directo en vivo):

```bash
pnpm tsx scripts/momentos.ts <url|archivo> [--top 8] [--min 15] [--max 40] [--idioma es]   # candidatos.md
pnpm tsx scripts/importar-clip.ts <fuente-id> <inicio> <fin> --encuadre react|cara|contener|cubrir \
  [--titulo "…"] [--gancho "…"] [--permiso "campaña de X, 2026-11-19"] [--campania c.json] [--sin-render]
```

El clip queda como cualquier proyecto (subtítulos, recortar palabras, quitar escenas, QC); la imagen
sigue a la voz al recortar. Sin `--permiso` la licencia queda «revisar». Las fuentes viven en
`~/geeper-data/_fuentes/<id>/`. Necesita el venv `~/dev/video-tools/venvs/geeper-clips` y el modelo
YuNet (`pnpm run doctor` dice cómo instalarlos).

Datos de cada proyecto en `~/geeper-data/<slug>/`: `geeper.json`, `assets/`, `renders/`
(`v<N>-<perfil>.mp4`, su `.qc.json` y la hoja de contacto), `manifiestos/`, `logs/` y `build/` (el
proyecto Hyperframes compilado; se abre con `npx hyperframes@0.9.27 preview build/hf-9x16`).

## Cómo está hecho

- Next.js 16 (App Router) + TypeScript estricto + Prisma 7 sobre SQLite (`~/geeper-data/geeper.db`).
- **Cola en SQLite** con lease: un worker (`pnpm run worker`) con un ejecutor por motor (`mpt`, `voz`,
  `render`). Cada paso calcula `input_hash` y deja manifiesto; si se corta, al relanzar se saltan los
  terminados. Al arrancar detecta reinicios de Windows (Kernel-Power 41 y arranque de WSL) y marca
  «interrumpido» lo que corría; lo de GPU nunca se reintenta solo.
- **`geeper.json`** (esquema Zod v1, `src/lib/esquema.ts`) es la fuente de verdad, con pistas, clips con
  rango y marcadores al estilo OpenTimelineIO. Hyperframes es un destino de compilación.
- Todo lo que usa la GPU pasa por `~/dev/video-tools/bin/gpu-lock`.

## Tiempos medidos (2026-11-17, RTX 5080, shorts de 45–57 s)

| Paso | Tiempo |
|---|---|
| `pnpm run doctor` | 5 s |
| Importar un short de MPT (copiar + whisper `medium` en CPU + escenas) | 30 s |
| Regenerar la voz del guion (MPT `/audio`, Kokoro en CPU) | 10 s |
| Realinear subtítulos (whisper `medium` en CPU) | 30 s |
| Render completo: mezcla 0,4 s + check 4–7 s + render NVENC 30–46 s + loudnorm y codificación de entrega 14 s + QC 6 s | 55–71 s |
| Reeditar (2 subtítulos, quitar escena, pasar a 16:9) y renderizar, sin GPU para generar | 58 s |
| Relanzar un render interrumpido (se saltan mezcla y check) | 53 s |
| Render con ediciones v2 (recorte, transiciones, movimiento, color, 2 textos, superposición, 3 plataformas) y máster ProRes, short de 51 s (2026-11-18) | 212 s (el máster: 159 s y 2,1 GB) |
| Volver a renderizar una versión sin cambios de imagen ni sonido (p. ej. sólo «uso comercial») | 6 s |
| Generar un tema con MPT (GPU) | **sin medir en Geeper** (el dueño no autorizó GPU en esta sesión; MPT solo tardaba ~3 min) |

## Limitaciones conocidas

- **Legibilidad:** con la voz a 0,85, 3 de 4 shorts pasan la regla de ≤ 17 car./s; el cuarto queda en
  17,4. Decisión pendiente en `docs/DECISIONES.md` §3.
- **Música:** la de MPT (`resource/songs`) tiene licencia desconocida; el QC lo avisa. Conviene poner
  una carpeta con licencia clara en la plantilla.
- Chrome renderiza por software en WSL (Hyperframes no ve la GPU desde Linux); NVENC sí se usa.
- La vista «En vivo» es la composición sin renderizar (player oficial de Hyperframes): el QC y la descarga son del render.
- Corregir un subtítulo se pierde si después se regenera la voz con otras palabras.
- El worker no recarga código en caliente: tras cambiar código, reinicia `dev:up`.
- M5 (plano Wan) no está hecho; era opcional.

## Apagar todo

```bash
# En la terminal de dev:up: Ctrl+C (apaga web y worker; lo que corría queda «interrumpido»).
pkill -INT -f "scripts/dev-up.ts"          # si dev:up quedó en segundo plano
```

Geeper no levanta servicios propios: MoneyPrinterTurbo sigue en Docker como antes
(`cd ~/dev/MoneyPrinterTurbo && docker compose stop` si quieres apagarlo; nunca `down -v` ni `prune`).
Los contenedores de Farol no se tocan.

## Desarrollo

```bash
pnpm run typecheck && pnpm run lint && pnpm test
pnpm tsx scripts/ui/capturas.ts /tmp/capturas [proyectoId]   # UI a 1440 px y en teléfono, sin errores
pnpm tsx scripts/ui/reeditar.ts <proyectoId> /tmp/capturas    # reedición completa desde la UI
pnpm tsx scripts/ui/editar-texto.ts <proyectoId>               # recortar y restaurar una palabra con clics
pnpm tsx scripts/ui/desborde.ts /proyectos/<id> 390            # qué elementos se salen del ancho
```

Para probar sin tocar `~/geeper-data`, apunta a otra carpeta y otra base (el seed crea las plantillas):

```bash
GEEPER_DATA=/tmp/geeper-prueba GEEPER_DB=/tmp/geeper-prueba/geeper.db pnpm exec prisma db push
GEEPER_DATA=/tmp/geeper-prueba GEEPER_DB=/tmp/geeper-prueba/geeper.db pnpm tsx prisma/seed.ts
```
