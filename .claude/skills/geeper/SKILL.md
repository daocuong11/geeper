---
name: geeper
description: Proponer cambios a un proyecto de Geeper (geeper.json) — corregir subtítulos, quitar o reordenar escenas, cambiar formato, plantilla, voz o lo que se muestra — validados con el esquema y mostrados como diferencias antes de aplicarlos. Úsala cuando la persona pida editar un video de Geeper o entender su geeper.json.
---

# Geeper: editar un proyecto vía geeper.json

Geeper (`~/dev/dimerso/products/geeper`, web en http://localhost:3300) guarda cada proyecto en
`~/geeper-data/<slug>/geeper.json`. Ese archivo es la **fuente de verdad**; Hyperframes es sólo un
destino de compilación. **Nunca edites `geeper.json` ni el HTML de `build/` a mano**: propone el cambio
y deja que Geeper lo valide, muestre las diferencias y lo guarde como versión nueva.

## El esquema (v1), en corto

Definido con Zod en `src/lib/esquema.ts` (la referencia exacta):

- `schemaVersion: 1`, `id`, `nombre`, `tema`, `formato` (`9:16 | 16:9 | 1:1`), `plantilla` (slug), `fps: 30`.
- `voz`: `{ motor, voz, velocidad, idioma }`: cómo se genera la **próxima** voz.
- `guion.texto`: el guion que se oye.
- `mostrar`: `[{ de, a }]`: cambia lo que se lee sin cambiar lo que se oye (`GTA seis` → `GTA VI`).
- `assets`: `{ id: { tipo, ruta, hash, source: archivo|mpt|tts|wan, licencia, duracion, ancho, alto, regenerar } }`.
- `pistas` (como OpenTimelineIO): `visual` y `voz` con **un clip por escena, en el mismo orden**, y
  `musica` opcional. Cada clip: `{ id, asset, rango: { inicio, duracion }, escena }`. `rango` es sobre
  el asset (source range). La posición en la línea de tiempo **no se guarda**: sale del orden de la pista
  `voz`. La duración de una escena es la de su clip de voz.
- `escenas`: `{ id: { texto (lo que se oye), palabras: [{ texto, inicio, fin }] (en el tiempo del asset
  de voz), correcciones: [{ desde, hasta, texto }] } }`. Una corrección cambia lo **mostrado** sobre las
  palabras oídas `[desde, hasta)`.
- `marcadores`: cortes y notas (informativos).

Los subtítulos no se guardan: se calculan (grupos de hasta 4 palabras, ≤ 2 líneas, ritmo ≤ 17 car./s).

## Cómo proponer un cambio

1. Mira el estado: `cat ~/geeper-data/<slug>/geeper.json` o la página del proyecto. Para ver los
   subtítulos actuales con sus índices, `curl -s localhost:3300/api/proyectos/<id> | jq '.escenas[] | {id, grupos}'`.
2. Escribe una lista de ediciones en un archivo temporal. Tipos (ver `src/lib/ediciones.ts`):
   - `{"tipo":"corregirSubtitulo","escena":"e02","desde":3,"hasta":6,"texto":"nuevo texto"}`
   - `{"tipo":"quitarEscena","escena":"e05"}` (también quita lo que se oye en ella)
   - `{"tipo":"moverEscena","escena":"e05","a":0}`
   - `{"tipo":"cambiarFormato","formato":"16:9"}` · `{"tipo":"cambiarPlantilla","plantilla":"dimerso"}`
   - `{"tipo":"cambiarMostrar","mostrar":[{"de":"GTA seis","a":"GTA VI"}]}`
   - `{"tipo":"ajusteVisual","escena":"e01","ajuste":"contener","ancla":"arriba"}`
   - `{"tipo":"cambiarVoz","velocidad":0.9}`
3. Valida y muestra las diferencias (no aplica nada):
   `cd ~/dev/dimerso/products/geeper && pnpm tsx scripts/proponer.ts <slug> /tmp/propuesta.json`
4. Enséñale las diferencias a la persona. **Sólo con su aprobación**, aplica:
   `pnpm tsx scripts/proponer.ts <slug> /tmp/propuesta.json --aplicar`
5. Renderizar y regenerar la voz se piden desde la UI (botones «Renderizar» y «Regenerar voz»), o:
   `pnpm tsx scripts/encolar.ts <slug> render.entregar` · `pnpm tsx scripts/encolar.ts <slug> voz.regenerar '{"escena":null,"cadena":["render.entregar"]}'`.

## Reglas

- Claude nunca está en el camino del render: sólo propone `geeper.json`.
- Nada de material de Rockstar ni de marcas ajenas en textos o plantillas.
- Todo cambio queda como una versión; la persona puede volver atrás desde «Historial».
- Generar con MPT usa la GPU: no lo lances sin permiso de la persona (Windows se ha reiniciado sin aviso).
- Hyperframes está fijado en la versión de `HYPERFRAMES_VERSION` (`src/lib/rutas.ts`, hoy 0.9.27). Las
  skills `hyperframes*`, `media-use`, `reverse-any-video` y `style-sampling` de `.claude/skills/` son
  las de esa versión; cuando digan `npx hyperframes …`, usa siempre `npx hyperframes@0.9.27 …`, nunca
  la última. Para subir de versión, actualiza a la vez la constante y esas skills (del tag `vX.Y.Z` de
  `heygen-com/hyperframes`).
- Telemetría de Hyperframes siempre apagada: `HYPERFRAMES_NO_TELEMETRY=1` y `DO_NOT_TRACK=1`. No
  ejecutes los «usage beacon» (`npx hyperframes events …`) ni `feedback` que piden esas skills.
