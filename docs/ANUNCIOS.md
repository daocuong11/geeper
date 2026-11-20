# Geeper — Anuncios

<!-- 2026-11-19 · basado en AgriciDaniel/claude-ads (MIT) -->

Sección `/anuncios`: lleva una campaña del brief al video listo para el administrador de anuncios,
con cada chequeo respaldado por evidencia. **Geeper no toca las cuentas de anuncios**: prepara,
genera y revisa; la persona crea el anuncio en Google Ads, Meta, TikTok o LinkedIn.

## 1. Qué se tomó de claude-ads y qué no

[claude-ads](https://github.com/AgriciDaniel/claude-ads) (MIT, © 2026 Daniel Agrici) es una skill de
Claude Code para auditar cuentas de anuncios de 12 plataformas. Casi todo es método, no código
reusable. Se revisaron `ads/SKILL.md`, `ads/references/*` (specs, copy, compliance, benchmarks,
voice-to-style), `skills/ads-{create,creative,dna,generate,test,math}` y los agentes
`creative-strategist`, `copy-writer`, `format-adapter` y `audit-creative`.

| De claude-ads | En Geeper |
|---|---|
| Contrato de resultados `pass` / `fail` / `unknown` / `not_applicable` con evidencia; «unknown es una respuesta válida y nunca se adivina» | `src/lib/anuncios/revision.ts`: todos los chequeos |
| No congelar límites volátiles (duración, peso, caracteres); enlazar la fuente oficial y verificar con fecha | `catalogo.ts` guarda sólo el formato nativo y las URL oficiales; «Especificaciones vigentes verificadas» es manual, con evidencia y fecha |
| Puerta de especificaciones por ubicación (`platform-specs.md`, `*-creative-specs.md`) | Matriz concepto × ubicación en la pestaña Revisión |
| Conceptos «materialmente distintos»; redimensionar no es un concepto nuevo (`ads-create`, `ads-creative`) | Chequeo «Concepto distinto de los demás» (mismo gancho o mismo video = falla) |
| Marcos de copy como preguntas, sin puntaje ni ganador por defecto (`copy-frameworks.md`) | Guía del marco en el editor de conceptos (AIDA, PAS, BAB, 4P, FAB, Persona-Historia-Solución) |
| No inventar testimonios, cifras, urgencia ni garantías | Afirmaciones con prueba y aprobación en el brief; heurística que pide prueba para cifras, superlativos, garantías y urgencia |
| Categorías de alto riesgo y contenido generado con IA (`compliance.md`) | Categoría sensible en el brief; chequeo manual de etiqueta de IA cuando hay assets de MPT, TTS o Wan |
| Diseño de experimentos (`ads-test`): una variable, métrica primaria, guardarraíles, muestra decidida antes, no cortar al mirar | Pestaña Prueba con calculadora de tamaño (`muestra.ts`) |
| Copy deck y reporte (`ads-report`) | Exportar Markdown y checklist CSV |

| Lectura de la prueba (`ads-test`): verificar datos completos antes de estimar; no declarar ganador temprano | `lectura.ts`: prueba z de dos proporciones, intervalo, Bonferroni; «sigue corriendo» hasta la muestra decidida; guardarraíles antes de escalar |
| Agentes `creative-strategist` y `copy-writer`: proponen, el conductor valida | `scripts/anuncio.ts` + skill `geeper`: Claude propone conceptos y afirmaciones; diferencias antes de aplicar |
| Perfil de marca (`ads-dna`, `voice-to-style`): observado separado de inferido, la persona confirma | `marca.ts` + «Leer la marca desde su web» en el Brief; crea una plantilla con los colores confirmados |
| Variantes con un solo cambio | «Variante de gancho»: el mismo video con otra primera escena (voz en CPU, sin GPU) |

**No se tomó:** las auditorías de cuentas (Google, Meta, Amazon, Apple…) con exportaciones de la
cuenta, el núcleo Python de puntuación, la generación de imágenes con APIs pagas, el Cockpit, las
mutaciones de cuentas y los benchmarks. Geeper es un estudio de video local a US$0 sin acceso a las
cuentas de anuncios; eso sería otro producto. La tabla de voz de marca → estilo visual
(`voice-to-style.md`) queda como idea para las plantillas.

## 2. Flujo

1. **Brief:** marca, producto, objetivo, oferta, destino, botón de CTA de la red, audiencia,
   categoría sensible, ubicaciones, plantilla y afirmaciones (texto + prueba + aprobada).
2. **Conceptos:** gancho, insight, promesa, pruebas citadas, narrativa, objeciones, CTA que se dice,
   hipótesis, marco y **guion**. «Generar video» crea un proyecto de Geeper en el formato de la
   ubicación principal y manda el guion **tal cual** a MPT (`video_script`): MPT no escribe otro. Un
   concepto con video no se vuelve a generar sin desvincularlo antes.
3. **Revisión:** se recalcula en cada guardado y cada 5 s mientras un video se genera.
4. **Prueba:** control, tratamientos, variable, unidad de aleatorización, métrica, guardarraíles,
   tamaño de muestra y regla de parada.
5. **Exportar:** copy deck `.md` y checklist `.csv` (concepto, ámbito, chequeo, estado, evidencia,
   acción, fuente, fecha).

## 3. Chequeos

| Ámbito | Chequeo | Cómo se decide |
|---|---|---|
| Copy | Concepto distinto | Falla si comparte gancho (normalizado) o video con otro concepto |
| Copy | Llamado a la acción | Falla sin CTA; pasa si el guion lo dice; si no, «sin saber» (la tarjeta final puede bastar) |
| Copy | Afirmaciones con prueba | Heurística sobre gancho, promesa, guion, CTA y textos en pantalla; «sin saber» si alguna no coincide con una afirmación aprobada; «no aplica» si no hay |
| Copy | Pruebas citadas aprobadas | Falla si el concepto cita afirmaciones sin aprobar o borradas |
| Video | Video del concepto | Falla sin proyecto vinculado |
| Video | Render con QC aprobado | Último render de la versión actual |
| Video | Se entiende sin sonido | Regla `subtitulos` del QC |
| Video | Uso comercial y licencias | Falla si el proyecto no es comercial (botón «Preparar»); luego, regla `licencias` del QC |
| Video | IA declarada | Manual si hay assets `mpt`, `tts` o `wan` |
| Ubicación | Formato nativo | El del video contra el de la ubicación (botón para cambiarlo) |
| Ubicación | Texto fuera de la interfaz | En 9:16 con interfaz conocida, regla `zonas-seguras` con esa plataforma (botón «Preparar» si falta); en el resto, «sin saber»: se confirma en la vista previa |
| Ubicación | Especificaciones, política, vista previa | Manuales, con enlace oficial, evidencia y fecha |

«Preparar el proyecto para anuncio» aplica la edición `cambiarDestino` (uso comercial + plataformas
de las ubicaciones) y, si se pide, `cambiarFormato`; crea una versión nueva y hay que volver a
renderizar.

## 4. Tamaño de muestra

Aproximación normal para dos proporciones, bilateral (Fleiss, sin corrección de continuidad); con k
tratamientos se usa α/k (Bonferroni). Con tasas base < 1 % avisa que el número es un mínimo. Sin
tasa base o efecto mínimo no calcula nada. Verificado: 5 % → 6 %, α 5 %, potencia 80 % ≈ 8 150 por
variante (`tests/anuncios.test.ts`).

## 5. Datos

`Campana` (Prisma) con `datos` en JSON validado por `src/lib/anuncios/esquema.ts`. Los conceptos
guardan el `proyectoId` de su video; borrar la campaña no borra los proyectos. Requiere
`pnpm run db:push` una vez (crea la tabla; no toca las demás) y reiniciar `dev:up` (el worker manda
el guion a MPT).

## 6. Funciones agregadas (2026-11-19)

**Lectura de resultados** (pestaña Prueba): unidades y conversiones por variante, copiadas del
administrador. Mientras alguna variante no llegue a la muestra decidida, dice «sigue corriendo» y
muestra los números como provisionales. Con la muestra completa: diferencia, intervalo y p por
tratamiento, α corregido por Bonferroni; «gana» sólo si es significativo y positivo, y no recomienda
escalar si un guardarraíl se rompió o no se confirmó.

**Conceptos con Claude:** `pnpm tsx scripts/anuncio.ts listar | ver <id> | proponer <id> propuesta.json
[--aplicar]`. Sólo cambian las claves que trae la propuesta. Las afirmaciones nuevas entran sin aprobar,
y una aprobada cuyo texto cambia vuelve a quedar sin aprobar. No se pueden vincular videos, aprobar
afirmaciones ni quitar conceptos con video (el esquema lo rechaza). Instrucciones en la skill `geeper`.

**Variante de gancho** (Conceptos → Video): copia el proyecto con sus assets, cambia el texto de la
primera escena y encola `voz.regenerar` de esa escena (Kokoro de MPT, en CPU) y el render. Crea un
concepto nuevo vinculado; si la prueba está vacía, la arma (original contra variante, variable
«gancho»). Necesita el contenedor de Kokoro de MPT encendido.

**Marca desde la web** (Brief): sólo http/https públicos (bloquea localhost, redes privadas y la IP de
metadatos, también tras una redirección), 2 MB de HTML y 3 hojas de estilo del mismo dominio, 10 s
por pedido, sin ejecutar nada de la página. Los colores con más saturación son la propuesta de acento;
las fuentes son sólo observación (se usan si la persona confirma que están disponibles y con licencia).
«Crear plantilla y usarla» copia la plantilla base y cambia marca, colores, CTA y tarjeta final.
Límite conocido: no protege contra un DNS que cambie entre la comprobación y la descarga (uso local).

## 7. Pendiente

- Leer resultados reales (CTR, retención) por las APIs oficiales y cruzarlos con el concepto: es el
  bucle D2 de `BRECHAS.md`.
- Medir la banda segura de Stories y Feed (hoy sólo Shorts, TikTok y Reels).
- 4:5 para Feed de Meta.
