---
name: geeper
description: Proponer cambios a un proyecto de Geeper (geeper.json) — corregir subtítulos, recortar palabras o silencios, quitar o reordenar escenas, transiciones y efectos, textos en pantalla, superposiciones, formato, plantilla, voz, destino — validados con el esquema y mostrados como diferencias antes de aplicarlos. Úsala cuando la persona pida editar un video de Geeper o entender su geeper.json, y para proponer conceptos, ganchos, guiones o afirmaciones de una campaña de la sección Anuncios.
---

# Geeper: editar un proyecto vía geeper.json

Geeper (`~/dev/dimerso/products/geeper`, web en http://localhost:3300) guarda cada proyecto en
`~/geeper-data/<slug>/geeper.json`. Ese archivo es la **fuente de verdad**; Hyperframes es sólo un
destino de compilación. **Nunca edites `geeper.json` ni el HTML de `build/` a mano**: propone el cambio
y deja que Geeper lo valide, muestre las diferencias y lo guarde como versión nueva.

## El esquema (v2), en corto

Definido con Zod en `src/lib/esquema.ts` (la referencia exacta). Un `geeper.json` v1 se migra solo al
leerlo (`migrar`): v2 sólo agrega campos con valor por defecto.

- `schemaVersion: 2`, `id`, `nombre`, `tema`, `formato` (`9:16 | 16:9 | 1:1`), `plantilla` (slug),
  `fps` (24, 25, 30 o 60; por defecto 30).
- `voz`: `{ motor, voz, velocidad, idioma }`: cómo se genera la **próxima** voz.
- `guion.texto`: el guion que se oye.
- `mostrar`: `[{ de, a }]`: cambia lo que se lee sin cambiar lo que se oye (`GTA seis` → `GTA VI`).
- `assets`: `{ id: { tipo, ruta, hash, source: archivo|mpt|tts|wan, licencia, duracion, ancho, alto, regenerar } }`.
  `regenerar` guarda prompt, modelo y, para los modelos locales, el sha256 de los pesos (`pesos`, `alineacion`).
- `pistas` (como OpenTimelineIO):
  - `visual` y `voz` con **un clip por escena, en el mismo orden**; `musica` opcional. Cada clip:
    `{ id, asset, rango: { inicio, duracion }, escena }`; `rango` es sobre el asset (source range). La
    posición en la línea **no se guarda**: sale del orden de la pista `voz`.
  - Efectos del clip visual de una escena: `transicion` (`corte | fundido | deslizar | zoom`, entra sobre
    la escena anterior), `movimiento` (`{ desde, hasta }` con `{ escala, x, y }`: Ken Burns, paneos),
    `velocidad` (0,1–10) y `color` (`{ brillo, contraste, saturacion }`).
  - **Pistas libres** (cualquier otro `id`, p. ej. `broll`, `efectos`): superposiciones de video/imagen
    o efectos de sonido. Cada clip lleva `inicio` en la línea final, y además `opacidad`, `volumen`,
    `transicion`, `movimiento`.
- `textos`: títulos, rótulos o citas superpuestos: `{ id, texto, inicio, duracion, estilo: titulo|rotulo|cita, posicion: arriba|centro|abajo }`.
- `escenas`: `{ id: { texto (lo que se oye), palabras: [{ texto, inicio, fin, confianza? }] (en el tiempo
  del asset de voz), correcciones: [{ desde, hasta, texto }], recortes: [{ inicio, fin, motivo }] } }`.
  Una corrección cambia lo **mostrado** sobre las palabras oídas `[desde, hasta)`. Un **recorte** quita
  ese tramo de la voz (y su tiempo) — es la edición por texto. La duración de una escena es la de su
  clip de voz menos sus recortes. `confianza` < 0,6 = tiempo dudoso (no recortes ahí sin escuchar).
- `marcadores`: cortes, notas y pulsos de la música (`tipo: "pulso"`).
- `comercial` (el QC bloquea licencias no comerciales o dudosas), `plataformas` (`youtube | tiktok |
  instagram | facebook`: en 9:16 estrechan la banda segura) y `entrega.master` (máster .mov).

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
   - Edición por texto: `{"tipo":"recortarPalabras","escena":"e02","desde":3,"hasta":5}` ·
     `{"tipo":"restaurarPalabras","escena":"e02","desde":3,"hasta":5}` ·
     `{"tipo":"quitarSilencios","umbral":0.6,"dejar":0.25}` · `{"tipo":"quitarMuletillas"}` ·
     `{"tipo":"quitarRecortes"}` (todas aceptan `"escena"` para limitarse a una)
   - `{"tipo":"efectosVisual","escena":"e03","transicion":{"tipo":"fundido","duracion":0.5},"movimiento":{"desde":{"escala":1},"hasta":{"escala":1.15}},"velocidad":1.25,"color":{"saturacion":1.2}}` (`null` quita un efecto)
   - `{"tipo":"agregarTexto","texto":{"texto":"Dato","inicio":2,"duracion":3,"estilo":"titulo","posicion":"arriba"}}` · `{"tipo":"editarTexto","id":"texto-1","cambios":{"inicio":3}}` · `{"tipo":"quitarTexto","id":"texto-1"}`
   - `{"tipo":"agregarClipLibre","pista":"broll","asset":"<id ya registrado>","inicio":6,"duracion":1.5}` · `{"tipo":"quitarClipLibre","clip":"broll-1"}`
     (para un archivo nuevo, súbelo desde la UI: «Superposiciones y efectos de sonido»)
   - `{"tipo":"cambiarDestino","comercial":true,"plataformas":["tiktok","youtube"],"master":false}`
   - `{"tipo":"fijarMusica","inicio":1.25}` (mejor: botón «Alinear cortes al ritmo», que detecta los pulsos)
3. Valida y muestra las diferencias (no aplica nada):
   `cd ~/dev/dimerso/products/geeper && pnpm tsx scripts/proponer.ts <slug> /tmp/propuesta.json`
4. Enséñale las diferencias a la persona. **Sólo con su aprobación**, aplica:
   `pnpm tsx scripts/proponer.ts <slug> /tmp/propuesta.json --aplicar`
5. Renderizar y regenerar la voz se piden desde la UI (botones «Renderizar» y «Regenerar voz»), o:
   `pnpm tsx scripts/encolar.ts <slug> render.entregar` · `pnpm tsx scripts/encolar.ts <slug> voz.regenerar '{"escena":null,"cadena":["render.entregar"]}'`.

## Anuncios: proponer conceptos y guiones

La sección `/anuncios` guarda campañas (brief, conceptos, revisión, prueba). Claude propone; la persona
aprueba en la app. Detalle en `docs/ANUNCIOS.md`.

1. Mira la campaña y lo pendiente: `pnpm tsx scripts/anuncio.ts listar` y
   `pnpm tsx scripts/anuncio.ts ver <id>` (brief, conceptos y cada chequeo que falla o queda «sin saber»).
2. Escribe `/tmp/propuesta.json`:
   `{"brief": {...campos...}, "conceptos": [{"nombre": "...", "marco": "pas", "gancho": "...", "promesa": "...",
   "narrativa": "...", "cta": "...", "objeciones": "...", "hipotesis": "...", "guion": "...", "principal": "youtube-shorts"}],
   "quitar": ["c-id"]}`. Un concepto con `id` existente se edita; sin `id`, es nuevo.
3. Valida y muestra las diferencias: `pnpm tsx scripts/anuncio.ts proponer <id> /tmp/propuesta.json`.
   Enséñaselas a la persona y **sólo con su aprobación** repite con `--aplicar`.

Reglas de contenido (de claude-ads):
- Conceptos **materialmente distintos** (otra idea, otro gancho), no la misma frase reescrita.
- **No inventes** cifras, testimonios, garantías, urgencia ni comparaciones. Si el guion necesita una
  afirmación, propónla en `brief.afirmaciones` con su `prueba`: entra **sin aprobar** y la aprueba la persona.
- El guion va tal cual a MPT: abre con el gancho, cierra con el CTA, frases cortas (≤ 17 car./s al leer).
- Un marco (`aida`, `pas`, `bab`, `4p`, `fab`, `historia`, `ninguno`) ordena el mensaje; no promete resultados.
- No vincules videos ni marques verificaciones manuales: eso es de la persona en la app. Generar el
  video usa la GPU y se pide desde la UI.

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
