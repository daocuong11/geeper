# Geeper como app de escritorio (Windows y macOS)

Objetivo (decidido el 2026-11-20): instaladores para el equipo interno. Windows **nativo** (sin WSL) y
macOS Apple Silicon completo y adaptado (VideoToolbox, IA en CPU/Metal). Sin firma de código de pago
por ahora. El desarrollo sigue igual en Linux/WSL: nada de esto cambia `pnpm run dev:up`.

## Cómo está armado

La app no reescribe Geeper: es una **carcasa Electron** (`escritorio/main.ts`) que arranca los mismos
dos procesos que `dev:up` y abre una ventana:

```
Electron (main.cjs)
 ├─ preparar-db.mjs   crea/completa las tablas (esquema.sql con IF NOT EXISTS) y siembra plantillas
 ├─ standalone/server.js   Next en modo standalone, en 127.0.0.1:3300 (o un puerto libre)
 └─ worker.mjs        la cola (render, voz, MPT, redes)
```

Los tres corren con el Node de Electron (`ELECTRON_RUN_AS_NODE=1`). La carcasa les pasa dónde viven las
cosas y `src/lib/plataforma.ts` lo traduce para todo el código:

| | Desarrollo (WSL) | App en Windows | App en macOS |
|---|---|---|---|
| Datos (proyectos, base) | `~/geeper-data` | `Documentos\Geeper` | `~/Documents/Geeper` |
| Herramientas (venvs, CLIs, modelos) | `~/dev/video-tools` | `%LOCALAPPDATA%\Geeper\herramientas` | `~/Library/Application Support/Geeper/herramientas` |
| ffmpeg | `~/.local/bin` (NVENC) | incluido (Gyan 9.1, NVENC) | incluido (9.0.2, VideoToolbox) |
| Hyperframes | `npx hyperframes@0.9.27` | incluido (paquete npm) | incluido |
| Candado de GPU | `gpu-lock` del estudio (flock) | archivo con PID y latido (`gpu.ts`) | ídem |
| Logs | consola | `%APPDATA%\Geeper\logs` | `~/Library/Application Support/Geeper/logs` |

Las variables `GEEPER_*` siguen mandando sobre todo (pruebas, scripts). El puerto preferido es 3300
porque es el que tienen registrado las apps de OAuth de las redes.

## Construir

```bash
pnpm escritorio:preparar     # arma escritorio-app/ (sin instalador) para probar
pnpm escritorio:probar       # abre la app desde escritorio-app/ (Linux/WSLg)
pnpm escritorio:empaquetar   # instalador del sistema donde corre → dist-escritorio/
```

Desde la terminal de VS Code, `ELECTRON_RUN_AS_NODE=1` viene puesto y hace que Electron arranque como
Node, sin ventana: `escritorio:probar` lo quita. Probado en WSLg el 2026-11-20: crea la base, siembra
las plantillas, arranca servidor y worker, todas las páginas sin errores y al cerrar no quedan procesos.

Los instaladores de Windows y macOS se hacen en **GitHub Actions** (`.github/workflows/escritorio.yml`),
en una máquina de cada sistema: a mano desde la pestaña *Actions* («Run workflow») o subiendo una
etiqueta `v*` (entonces publica una release con el `.exe` y el `.dmg`).

`scripts/escritorio/empaquetar.ts` hace: `next build` standalone (en `.next-escritorio`, para no pisar el
`.next` del servidor que esté corriendo) → bundles con esbuild → `escritorio-app/` con un `node_modules`
plano instalado con npm (los enlaces de pnpm no viajan en un instalador) → `better-sqlite3` recompilado
para Electron (la versión que usa el adaptador de Prisma) → `esquema.sql`, `py/`, `docs/fuentes.json` →
ffmpeg del sistema bajado y verificado con SHA-256 (`escritorio/recursos.json`) → electron-builder.

## Instalar (equipo interno, sin firma)

- **Windows:** `Geeper-<versión>-win-x64.exe`. SmartScreen dice «Windows protegió su PC»: *Más
  información* → *Ejecutar de todas formas*. Se instala por usuario, sin permisos de administrador.
- **macOS:** `Geeper-<versión>-mac-arm64.dmg`, arrastrar a Aplicaciones. La primera vez: clic derecho
  sobre Geeper → *Abrir* → *Abrir* (va firmado ad hoc; sin eso macOS diría que está dañado).
- Actualizar: instalar el nuevo encima. Los datos (Documentos/Geeper) y las herramientas no se tocan.

## Fases

1. **Hecho (2026-11-20):** núcleo multiplataforma (`plataforma.ts`, rutas, ejecutables `.exe`, venvs
   `Scripts\python.exe`, zips sin `unzip`/`python`, junctions en Windows, candado de GPU propio,
   reinicio y telemetría sin `/proc`), Hyperframes empaquetado (`hyperframes.ts`), instaladores de CLIs
   de Craft por sistema, carcasa Electron, base de datos en el primer arranque, empaquetador, CI.
2. **«Preparar el estudio»** (asistente de primer arranque, en Sistema): crear con `uv` los venvs de
   Python (voz: kokoro-onnx; clips: OpenCV + yt-dlp; whisper para transcribir), bajar los modelos,
   instalar PhotoCraft y VectorCraft (ya funciona el botón), revisar Docker Desktop y levantar
   MoneyPrinterTurbo con `docker compose` (sin `down -v` ni `prune`). Incluir `mpt_acabado.py` en `py/`
   (hoy `py/geeper_py.py` lo importa de `~/dev/video-tools/bin`). Rehacer el doctor con chequeos por
   sistema (hoy varios suponen Linux).
3. **Pruebas reales** con los instaladores en Windows (NVENC, rutas con tildes y espacios, OneDrive en
   Documentos) y en un Mac (VideoToolbox: `hyperframes render --gpu` hoy usa NVENC, por eso en macOS
   el render va por CPU; voz en CPU/Metal; MPT en Docker sin GPU).

## Límites conocidos

- **Columnas nuevas en tablas existentes:** `esquema.sql` sólo crea lo que falta (tablas e índices). Si
  un cambio del esquema agrega una columna, hace falta adoptar migraciones de Prisma antes de publicar
  esa versión.
- **Docker / MoneyPrinterTurbo** no se instalan solos (Docker Desktop no se puede redistribuir): sin
  Docker, Geeper funciona para editar, renderizar, portadas, Media, anuncios y clips; generar videos
  nuevos con MPT y la IA local (títulos, ganchos, ideas) piden Docker.
- **Actualización automática:** no hay (sin firma, en macOS no funciona). Se instala la versión nueva
  encima; Sistema → Novedades puede avisar cuando se publique una release.
