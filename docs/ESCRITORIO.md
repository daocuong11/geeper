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
| whisper-cli | lo compila Hyperframes | incluido (whisper.cpp v1.9.5, CPU) | incluido (compilado con Metal) |
| uv (crea los Python) | el del PATH | incluido (0.13.9) | incluido |
| Python (voz, clips) | venvs de `~/dev/video-tools` | los crea «Preparar el estudio» en Herramientas | ídem |
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
ffmpeg, uv y whisper-cli de ese sistema, bajados y verificados con SHA-256 (en macOS whisper.cpp se
compila desde el tag fijado y se comprueba su commit; `escritorio/recursos.json`) → electron-builder.

En CI corren `pnpm typecheck` y `pnpm test:escritorio` (las pruebas que no dependen del estudio de
desarrollo de Linux). El flujo corre a mano, con una etiqueta `v*` o al subir una rama `integracion/**`.

## Instalar (equipo interno, sin firma)

- **Windows:** `Geeper-<versión>-win-x64.exe`. SmartScreen dice «Windows protegió su PC»: *Más
  información* → *Ejecutar de todas formas*. Se instala por usuario, sin permisos de administrador.
- **macOS:** `Geeper-<versión>-mac-arm64.dmg`, arrastrar a Aplicaciones. La primera vez: clic derecho
  sobre Geeper → *Abrir* → *Abrir* (va firmado ad hoc; sin eso macOS diría que está dañado). Si aun así
  dice que está dañado o bloquea ffmpeg o whisper: `xattr -dr com.apple.quarantine /Applications/Geeper.app`.
- **Después de instalar:** Sistema → **Preparar el estudio** → *Preparar*. Baja unos 3 GB la primera vez
  (Python, modelos de voz y de transcripción, PhotoCraft, VectorCraft) y deja todo en la carpeta de
  herramientas; no toca el sistema ni pide permisos de administrador. Se puede repetir: sólo instala lo
  que falte.
- Actualizar: instalar el nuevo encima. Los datos (Documentos/Geeper) y las herramientas no se tocan.

## Fases

1. **Hecho (2026-11-20):** núcleo multiplataforma (`plataforma.ts`, rutas, ejecutables `.exe`, venvs
   `Scripts\python.exe`, zips sin `unzip`/`python`, junctions en Windows, candado de GPU propio,
   reinicio y telemetría sin `/proc`), Hyperframes empaquetado (`hyperframes.ts`), instaladores de CLIs
   de Craft por sistema, carcasa Electron, base de datos en el primer arranque, empaquetador, CI.
2. **Hecho (2026-11-20): «Preparar el estudio»** (`src/lib/estudio.ts`, Sistema; desde la terminal:
   `scripts/preparar-estudio.ts`). Pasos, cada uno comprueba antes y sólo instala lo que falta:
   navegador de Hyperframes → Python de la voz con `uv` (Python 3.12 propio, kokoro-onnx y soundfile
   fijados) y una frase de prueba que baja los modelos de Kokoro → transcripción con el whisper-cli
   incluido y el modelo `medium`, probada sobre esa frase → Python de clips (OpenCV, yt-dlp) y YuNet →
   PhotoCraft → VectorCraft → Docker (sólo se revisa). La alineación de subtítulos ya no depende del
   estudio: `py/alineacion.py` es la copia de `alinear()` de `mpt_acabado.py` (una prueba compara las dos
   cuando el estudio está) y en la app corre con el Python de la voz. El doctor tiene chequeos por
   sistema; en la app, sus arreglos apuntan al botón.
   **MoneyPrinterTurbo y la IA local quedan sólo en el PC del estudio** (decidido el 2026-11-20): en los
   equipos, Docker es opcional y Sistema explica qué funciones faltan sin él.
3. **Pruebas reales** con los instaladores en Windows (NVENC, rutas con tildes y espacios, OneDrive en
   Documentos) y en un Mac (VideoToolbox: `hyperframes render --gpu` hoy usa NVENC, por eso en macOS
   el render va por CPU; voz en CPU/Metal; MPT en Docker sin GPU).

## Límites conocidos

- **Columnas nuevas en tablas existentes:** `esquema.sql` sólo crea lo que falta (tablas e índices). Si
  un cambio del esquema agrega una columna, hace falta adoptar migraciones de Prisma antes de publicar
  esa versión.
- **Docker / MoneyPrinterTurbo** no se instalan en los equipos (decisión del 2026-11-20): generar videos
  nuevos con MPT y la IA local (títulos, ganchos, ideas) se hacen en el PC del estudio. Sin Docker, Geeper
  funciona para editar, renderizar, voz, clips, portadas, Media y anuncios.
- **Transcripción en Windows** va por CPU (whisper `medium`, el binario oficial sin CUDA): más lenta que
  en el estudio, pero sin depender del driver.
- **Actualización automática:** no hay (sin firma, en macOS no funciona). Se instala la versión nueva
  encima; Sistema → Novedades puede avisar cuando se publique una release.
