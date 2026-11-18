# Encargo: MVP usable de Geeper

Lee este documento completo antes de ejecutar nada. Trabajas en `~/dev/dimerso/products/geeper`.
Responde en español, con tuteo en el código y en la interfaz («crea», «puedes», nunca «creá»).

## Lee primero

1. `docs/PRODUCTO.md`: qué es Geeper, la arquitectura, la calidad y las fases. Ese documento manda;
   este encargo fija el alcance del MVP.
2. `~/dev/video-tools/ESTUDIO.md`: el estudio de video que ya funciona en esta PC (comandos, GPU,
   reglas de convivencia).
3. `~/dev/MoneyPrinterTurbo/AUTOMATIZAR-GENERACION.md`: cómo está montado MoneyPrinterTurbo (MPT), las
   reglas de seguridad y los riesgos de reinicio.
4. `~/dev/video-tools/bin/mpt_acabado.py`: el acabado actual MPT → Hyperframes. Es la base del
   importador y del compilador del MVP; reutiliza su lógica, no la reescribas desde cero.
5. La API de MPT: `~/dev/MoneyPrinterTurbo/app/controllers/v1/video.py` y `app/models/schema.py`
   (`VideoParams`).

## Objetivo

Una persona abre `http://localhost:3300` y, sin tocar la terminal:

1. Crea un proyecto con un tema (o un lote de temas), un formato (9:16, 16:9 o 1:1) y una plantilla de
   canal.
2. Ve el avance de cada trabajo y el registro de errores.
3. Abre el proyecto terminado: escenas con su clip, su texto y sus tiempos, y la vista previa.
4. Edita: corrige el texto de un subtítulo, cambia lo que se muestra sin cambiar lo que se oye
   (`--mostrar` de `mpt-acabado`), quita o reordena escenas, reemplaza un clip por un archivo
   propio, cambia de plantilla o de formato. Después vuelve a renderizar **sin regenerar con la
   GPU**.
5. Regenera la voz de una escena o del guion completo, y Geeper realinea los subtítulos.
6. Descarga el render con su informe de calidad aprobado.

## Decisiones ya tomadas

- **Uso interno, en esta PC, US$0 al mes.** Ningún servicio de nube ni API paga. Si algo parece
  necesitarlo, propónlo con su costo mensual y no lo implementes.
- **Repo propio** en esta carpeta: `git init` y commits como `saihdez` (Conventional Commits). **Sin
  remoto y sin push**, hasta que el dueño lo pida.
- **Stack:** Next.js (App Router) + TypeScript estricto + Prisma sobre **SQLite**, en el puerto
  **3300** (el 3000 es de Farol y de Remotion). Node 24 y pnpm, como en Farol.
- **Cola de trabajos en SQLite**, sin Redis ni BullMQ. Un proceso worker aparte de Next
  (`pnpm run worker`) con un ejecutor por motor.
- **`geeper.json` es la fuente de verdad** de cada proyecto, con esquema Zod versionado
  (`schemaVersion: 1`) y conceptos de OpenTimelineIO: pistas, clips con rango, marcadores. Cada clip
  lleva su `source` (`archivo | mpt | tts | wan`) y lo necesario para regenerarlo. Hyperframes es un
  destino de compilación, no el formato guardado.
- **Motores del MVP:** MPT por su API HTTP (`127.0.0.1:8080`), Hyperframes **0.9.27 fijado** por CLI,
  whisper y Kokoro como ya los usa `mpt_acabado.py`, y ffmpeg (`~/.local/bin/ffmpeg`).
- **Fuera del MVP:** Remotion, el editor de línea de tiempo con arrastre, la publicación en redes,
  la localización y la revisión con un modelo de visión. **Wan es opcional** y va al final (M5).
- **Plantillas iniciales:** «GTA VI Shorts» (la del canal actual, sin material de Rockstar) y
  «Dimerso», neutra, para videos de Farol y de los otros productos. Las plantillas son datos (colores,
  tipografía, logo, CTA, tarjeta final, voz), no código.
- **Datos fuera del repo:** `~/geeper-data/<proyecto>/` (`geeper.json`, `assets/`, `renders/`,
  `manifiestos/`, `logs/`). El repo ignora esa carpeta.

## Reglas (no negociables)

- **No toques** los contenedores `supabase_*_farol` ni `farol-dev-redis`. Nunca `docker system prune`,
  `docker volume prune` ni `docker compose down -v`.
- **Sin `sudo`.** Si hace falta, dale al usuario el comando exacto.
- **Un trabajo de GPU a la vez:** todo lo que use la GPU (MPT, whisper en GPU, render NVENC, Wan) pasa
  por `~/dev/video-tools/bin/gpu-lock`.
- **Pide permiso antes de la primera generación completa con GPU** en cada sesión. Windows se
  reinicia sin aviso y ya lo hizo durante generaciones: avísale al usuario para que guarde su
  trabajo.
- **Nunca reintentes solo un trabajo de GPU** que estaba corriendo durante un reinicio: márcalo
  «interrumpido» y espera a que la persona lo relance desde la UI.
- `storage/tasks` de MPT es de root: lee esos archivos con `docker exec` o copiándolos con
  `docker cp`, nunca con `chmod` ni `chown` sobre la carpeta.
- Si Docker Desktop está apagado (error `npipe:////./pipe/dockerDesktopLinuxEngine`), pídele al
  usuario que lo abra.
- Secretos y claves nunca en git. El MVP no debería necesitar ninguno.

## Hitos

Cada hito termina con un commit y una verificación real, no sólo pruebas unitarias.

### M0: esqueleto

- Next.js + Prisma/SQLite + worker + `pnpm run dev:up` (web y worker en una terminal).
- Modelos: `Proyecto`, `Version` (cada `geeper.json` guardado), `Asset` (ruta, hash, `source`,
  prompt, semilla, modelo, **licencia**), `Trabajo` (motor, `input_hash`, estado, intentos,
  `lease_until`, log), `Render` (perfil, ruta, informe de QC), `Plantilla`.
- `pnpm run doctor`: verifica Docker, los contenedores de MPT, la API `:8080`, Hyperframes, ffmpeg con
  NVENC, el venv del estudio, la VRAM libre y el estado de `gpu-lock`, y dice cómo arreglar lo que
  falle. Sólo lectura.
- `MODELOS.md`: cada modelo con su origen, licencia y si permite uso comercial (ver la tabla de
  licencias de `PRODUCTO.md`).

### M1: cola robusta

- Cola en SQLite con *lease*, intentos y estados `pendiente | corriendo | hecho | fallido |
  interrumpido`.
- Cada paso calcula `input_hash` (entradas + parámetros + versión del motor); si ya existe su
  manifiesto con los mismos archivos, **se salta**.
- Escribe las salidas en un temporal y hace `rename` atómico al terminar.
- Al arrancar el worker, detecta si hubo un reinicio de Windows desde la última corrida (eventos
  `Kernel-Power 41` por PowerShell, como en `AUTOMATIZAR-GENERACION.md`) y marca «interrumpido» lo que
  estaba corriendo.
- Pruebas: un trabajo que se mata a la mitad y se relanza no repite los pasos terminados.

### M2: Fábrica de punta a punta

- Trabajo `mpt.generar`: `POST /api/v1/videos` con el tema, el formato y la voz de la plantilla,
  consulta `GET /tasks/{id}` y copia el resultado a `assets/` con su procedencia.
- **Importador MPT → `geeper.json`:** clips en el orden de `material_sources`, voz, mezcla, guion y
  tiempos por palabra alineados al guion (lógica de `mpt_acabado.py`).
- **Compilador `geeper.json` → proyecto Hyperframes:** marca, subtítulos karaoke, golpe de zoom en
  cada corte, tarjeta final y banda segura según la plantilla. Después `hyperframes check` y render
  `delivery` con NVENC.
- Lotes: un tema por línea; si se cortan, se retoman sin repetir los temas terminados.
- UI: lista de proyectos, crear proyecto o lote, avance en vivo y log de cada trabajo, relanzar.

### M3: control de calidad

Compuerta obligatoria antes de marcar un render como entregado. Guarda un informe JSON por render y lo
muestra en la UI:

- Sonoridad: −14 LUFS integrados y pico real ≤ −1 dBTP, con `loudnorm` en dos pasadas (corrige y
  mide).
- Color: salida Rec.709, rango limitado y etiquetas verificadas con `ffprobe`.
- Integridad: duración, fps y resolución exactas; sin fotogramas duplicados ni caídos de más.
- Subtítulos: ≤ 42 caracteres por línea, ≤ 2 líneas y ≤ 17 caracteres por segundo.
- Zonas seguras: el compilador comprueba que texto y logo caen dentro de la banda segura del formato.
- Hojas de contacto: fotogramas clave extraídos para que la persona (y tú) los revisen.

### M4: reedición sin GPU

- Vista de proyecto: escenas en orden con miniatura, texto, tiempos y vista previa (iframe de
  `hyperframes preview` o el render de baja resolución).
- Ediciones que sólo tocan `geeper.json` y vuelven a compilar: texto mostrado, quitar o reordenar
  escenas, reemplazar un clip por un archivo subido, cambiar de plantilla, cambiar de formato.
- Regenerar la voz (`POST /api/v1/audio` de MPT o Kokoro directo) y realinear los subtítulos; sólo se
  rehace lo que cambió, gracias a `input_hash`.
- Historial: cada guardado es una `Version` y se puede volver a una anterior.
- Skill de Claude `geeper` en `.claude/skills/geeper/SKILL.md`: explica el esquema y cómo proponer
  cambios a `geeper.json` (que Geeper valida y muestra como diferencias antes de aplicar).

### M5 (opcional, sólo si M0–M4 están verdes): plano Wan

- Para una escena, «Generar plano»: imagen de la escena → Wan 2.2 TI2V-5B a 576×1024 (o 1024×576),
  2–4 s, mediante OpenMontage **por CLI o por un script aparte, sin importar su código** (es AGPLv3).
  Se escala en la composición.
- Pasa por `gpu-solo` (necesita toda la VRAM). Avisa que tarda unos 5 minutos por plano.

## Cómo trabajar

- Haz los commits por hito. Corre lint, typecheck y pruebas del repo antes de cada commit.
- **Verificación real por hito:** M2, M3 y M4 se cierran con un video de verdad. Pide permiso antes de
  la primera generación con GPU, revisa el render con `ffprobe` y hojas de contacto, y pídele al
  usuario que escuche la voz (tú no puedes oírla).
- Prueba la UI en el navegador (Playwright o las herramientas de Chrome) en 1440 px de ancho y en
  ancho de teléfono.
- Usa Nemotron como dice `~/.claude/CLAUDE.md`: `razonar` para revisar el diseño de la cola y el
  esquema de `geeper.json` antes de cerrarlos, y `vision` para una segunda mirada a las hojas de
  contacto. Verifica cada hallazgo antes de aceptarlo.
- Si una decisión de `PRODUCTO.md` choca con la realidad (por ejemplo, Hyperframes no deja hacer algo),
  documéntalo en `docs/DECISIONES.md` con la alternativa y sigue. No cambies el alcance en silencio.

## Cuándo está terminado

- [ ] `pnpm run doctor` en verde y `pnpm run dev:up` levanta la web en `:3300` y el worker.
- [ ] Desde la UI, un lote de 3 temas sale acabado con la plantilla «GTA VI Shorts» y otro proyecto
      con «Dimerso», cada uno con su informe de QC aprobado.
- [ ] Un trabajo interrumpido a mitad (proceso matado) se relanza sin repetir los pasos terminados.
- [ ] En un proyecto terminado se corrigen dos subtítulos, se quita una escena, se cambia a 16:9 y
      se vuelve a renderizar sin usar la GPU para generar.
- [ ] Regenerar la voz de un proyecto realinea los subtítulos y pasa el QC.
- [ ] `README.md` con instalación, uso, tiempos medidos, limitaciones y cómo apagar todo;
      `MODELOS.md` y `docs/DECISIONES.md` al día.
- [ ] Los contenedores de Farol siguen como estaban.

Al terminar, reporta qué comprobaste y qué no, con tiempos medidos y las rutas de los videos. Si algún
punto queda sin cumplir, dilo claramente.
