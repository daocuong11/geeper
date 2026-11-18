# Geeper — documento de producto y plan

<!-- borrador: 2026-11-17 · F0 -->

## 1. Qué es

Geeper es el **estudio de video de Dimerso**: una app web local que lleva una idea a un video
terminado y lo deja **editable**: idea → guion → storyboard → generación → edición → acabado → control
de calidad. Por dentro orquesta las herramientas que ya funcionan en esta PC (MoneyPrinterTurbo,
Hyperframes, OpenMontage con Wan 2.2, Remotion, Kokoro, whisper, ffmpeg) y usa a Claude Code como
director.

**Para quién:** uso interno (canales propios, videos de Farol, Booka y Delfín, lanzamientos). Si
después se abre a clientes, esa decisión trae sus propios costos y licencias (§9).

**Qué significa «los más altos estándares» aquí:** que cada entrega pase un control de calidad
**medible** (sonoridad, color, zonas seguras, legibilidad de subtítulos, sin fotogramas dañados) y
que cualquier pieza se pueda reabrir y corregir una escena sin rehacer el video.

## 2. Principios

1. **US$0 al mes.** Todo corre en la RTX 5080 local. Una API paga (Veo, Kling, ElevenLabs) sólo
   entraría apagada por defecto, a mano, con tope y diciendo el costo antes.
2. **Una fuente de verdad editable.** Cada proyecto es un `geeper.json` versionado; Hyperframes,
   ffmpeg y Remotion son *destinos de compilación*, no el formato de guardado.
3. **Todo trabajo se puede reanudar.** Windows se reinicia sin aviso: cada paso es idempotente y
   deja un manifiesto; un reinicio cuesta como mucho el paso en curso.
4. **Un trabajo de GPU a la vez**, con el `gpu-lock` que ya existe.
5. **La persona aprueba, la máquina produce.** Claude propone guion y storyboard; nada caro (Wan,
   render final) arranca sin aprobación.
6. **Procedencia y licencia de cada asset** registradas desde el día uno.

## 3. Lo que ya tenemos (y su papel en Geeper)

| Pieza | Estado hoy | Papel en Geeper |
|---|---|---|
| MoneyPrinterTurbo (MIT, Docker, API en `127.0.0.1:8080`) | Tema → short en ~3 min | Motor de **volumen**: guion, voz, imágenes SDXL y armado base |
| `mpt-acabado` | Short de MPT → acabado Hyperframes en ~55 s | Se vuelve el compilador «MPT → `geeper.json`» |
| Hyperframes 0.9.27 (Apache 2.0) | Render 1080×1920 verificado, preview en vivo | **Compositor principal**: motion graphics, subtítulos karaoke, marca, tarjetas |
| OpenMontage (AGPLv3) + Wan 2.2 TI2V-5B (Apache 2.0) | Wan hasta 576×1024, ~5 min por 2 s | Motor de **planos generativos** y pipelines premium; siempre como proceso aparte |
| Remotion 4 (licencia Remotion) | Render verificado | Opcional; sólo si una pieza lo pide (§9) |
| Kokoro, Piper, whisper.cpp / whisper `medium` | Voces es-MX/es-ES, tiempos por palabra | Voz y alineación de subtítulos |
| Skill `brag` | Lee el código de un producto y hace su video de lanzamiento | Flujo «Lanzamiento de producto» |
| `qr-arte` | QR artísticos verificados con zxing | Asset para cierres y llamados a la acción |
| `gpu-lock`, `gpu-solo`, `con-telemetria` | `flock` (el kernel lo suelta si el proceso muere) | Planificador de GPU y telemetría de cada trabajo |
| Skills de Remotion y Hyperframes para Claude | En `OpenMontage/.claude/skills` | Las usa Claude como director |
| Nemotron (MCP) | Visión, razonamiento | Revisión de fotogramas en desarrollo; la app usa un modelo local (§7) |

## 4. Flujos

| Flujo | Entrada | Salida | Motores |
|---|---|---|---|
| **Fábrica** | Lista de temas + plantilla de canal | Lote de shorts 9:16 acabados y revisados | MPT → Hyperframes → QC |
| **Pieza premium** | Brief | Video de 30–120 s con guion y storyboard aprobados y planos generativos | Claude → Wan (OpenMontage) + Kokoro → Hyperframes → QC |
| **Lanzamiento de producto** | Repo de un producto (Farol, Booka…) | Video de lanzamiento 16:9 y 9:16 | `brag` → `geeper.json` → Hyperframes → QC |
| **Reedición** | Un proyecto existente | Escena corregida, otra voz u otro formato (9:16 ↔ 16:9 ↔ 1:1) | Sólo se regenera lo que cambió |
| **Localización** (después) | Proyecto en español | Versión en inglés con voz y subtítulos nuevos | Traducción + Kokoro + realineación |

Cada flujo pasa por los mismos estados: `borrador → guion aprobado → storyboard aprobado → generando
→ ensamblado → QC → entregado`.

## 5. Arquitectura

```
   Navegador (localhost)                       Claude Code (director)
   ┌───────────────────────┐                   skill geeper: escribe y edita
   │ App web Geeper        │◄── geeper.json ───geeper.json validado por esquema
   │ biblioteca · proyecto │
   │ storyboard · línea de │
   │ tiempo · preview · QC │
   └──────────┬────────────┘
              │ API local
   ┌──────────▼────────────┐   SQLite (proyectos, trabajos, assets, renders)
   │ Orquestador           │── cola persistente en SQLite (sin Redis)
   └──────────┬────────────┘
     un worker por motor, cada uno un proceso aparte; los de GPU toman gpu-lock
     ┌──────────┬───────────┬────────────┬────────────┬──────────┬────────┐
     │ MPT      │ Wan /     │ Voz        │ Hyperframes│ ffmpeg   │ QC     │
     │ (HTTP a  │ OpenMont. │ Kokoro /   │ compilar + │ proxies, │ medir y│
     │ :8080)   │ (CLI)     │ whisper    │ render     │ audio    │ revisar│
     └──────────┴───────────┴────────────┴────────────┴──────────┴────────┘
              │
   ~/geeper-data/<proyecto>/  assets/ · renders/ · manifiestos/ · geeper.json (con historial git)
```

**Decisiones:**

- **Stack:** Next.js + TypeScript + Prisma sobre **SQLite**, igual que lo que el equipo ya conoce de
  Farol, pero sin Supabase ni Redis: es una app de una sola PC. No toca `farol-dev-redis` ni los
  contenedores de Supabase.
- **Cola en SQLite** (tabla `jobs` con estado, intentos, `input_hash`, `lease_until`), no BullMQ: una
  dependencia menos y sobrevive al reinicio sin configurar persistencia de Redis.
- **Workers como procesos aparte** que llaman a cada herramienta por su borde natural: HTTP para
  MPT, CLI para OpenMontage, Hyperframes y ffmpeg. Nunca se importa código de OpenMontage (§9).
- **`geeper.json` (representación intermedia).** Toma los conceptos de OpenTimelineIO (pistas,
  clips, rangos, transiciones, marcadores) y agrega lo nuestro: `source` de cada clip
  (`archivo | mpt | wan | tts | captura | hyperframes-bloque`), el prompt y la semilla para
  regenerar, la voz, el tema de marca y los objetivos de QC. Tiene esquema (Zod/JSON Schema) y
  versión. De ahí salen tres compiladores:
  - `→ Hyperframes` (render final y preview),
  - `→ ffmpeg` (cortes rápidos, proxies, mezcla y sonoridad),
  - `→ Remotion` (sólo si hace falta).
  Hyperframes **no** es el formato guardado: editar HTML+GSAP a mano o con un modelo se rompe fácil
  y no se puede comparar entre versiones.
- **Preview:** el proyecto Hyperframes compilado dentro de un iframe (`hyperframes preview`), más
  proxies de baja resolución para mover la línea de tiempo con fluidez.
- **Claude como director:** una skill `geeper` con el esquema y ejemplos. Claude produce o modifica
  `geeper.json`; Geeper lo valida, muestra las diferencias y la persona aprueba. Claude nunca está en
  el camino de un render.

## 6. Modelo de datos (resumen)

`Proyecto` (formato, marca, flujo, estado) → `Version` de `geeper.json` (historial) → `Escena`
(texto, duración objetivo, plano pedido) → `Asset` (tipo, ruta, hash, `source`, prompt, semilla,
modelo, **licencia**, procedencia) → `Trabajo` (motor, `input_hash`, estado, intentos, log,
telemetría de GPU) → `Render` (versión, perfil de entrega, informe de QC).

`Marca` y `PlantillaDeCanal` aparte: tipografías, colores, logo, banda segura, tarjeta final y voz,
reutilizables entre proyectos.

## 7. Calidad: el estándar medible

Cada render final pasa una **compuerta de QC**. Si falla, no se marca entregado y el informe dice
qué y dónde.

| Área | Regla | Cómo se mide |
|---|---|---|
| Sonoridad | −14 LUFS integrados, pico real ≤ −1 dBTP (plataformas web) | `loudnorm` en dos pasadas; informe JSON |
| Mezcla | La música baja cuando habla la voz (*ducking*); sin silencios cortados de golpe | `sidechaincompress`; `silencedetect` |
| Color | Salida Rec.709, rango limitado, etiquetas correctas en el archivo | `zscale` al exportar; `ffprobe` verifica las etiquetas |
| Integridad | Sin fotogramas duplicados ni caídos; fps y duración exactos | `mpdecimate` / `ffprobe` |
| Zonas seguras | Texto y logo dentro de la banda segura de 9:16 / 16:9 | Lo comprueba el compilador con las cajas de cada elemento |
| Subtítulos | ≤ 42 caracteres por línea, 2 líneas, ≤ 17 caracteres por segundo, alineados a la voz | Validador sobre los tiempos por palabra |
| Ritmo | Cortes alineados al pulso de la música cuando hay música; duración de plano con mínimo y máximo por formato | Detección de pulsos (librosa) → marcadores en la línea de tiempo |
| Imagen | Sin manos, texto ni caras deformes en los planos generativos; nada de marcas ajenas | Revisión de fotogramas clave con un modelo de visión **local** (p. ej. Qwen-VL en Ollama), más la persona |
| Tipografía | Fuentes con licencia, números tabulares en cifras, sin viudas en títulos | Lo aplica el tema de marca |

Perfiles de entrega: `shorts-9x16` (1080×1920, 30 fps), `youtube-16x9` (1920×1080 / 3840×2160 si el
material lo aguanta), `cuadrado-1x1`. H.264 para redes y un máster de alta calidad (HEVC 10 bits o
ProRes) para archivar.

## 8. Robustez ante reinicios

- Cada trabajo calcula `input_hash` (entradas + parámetros + versión del motor). Si su manifiesto ya
  existe con ese hash y los archivos coinciden, **se salta**.
- Salidas a un directorio temporal y `rename` atómico al terminar; nunca queda un archivo a medias
  con el nombre final.
- Al arrancar, el orquestador devuelve a la cola los trabajos con *lease* vencido y **no** reintenta
  solo un trabajo de GPU que estaba corriendo cuando se reinició Windows: lo marca «interrumpido»
  y espera un clic (regla de `AUTOMATIZAR-GENERACION.md`).
- `gpu-lock` se queda: `flock` lo suelta el kernel si el proceso muere. `gpu-solo` vuelve a levantar
  Ollama y SDXL; `estudio.sh` los recupera tras un reinicio.
- Wan se pide por plano (2–4 s), así un reinicio pierde un plano, no la pieza.

## 9. Licencias

| Componente | Licencia | Uso interno | Si algún día es SaaS |
|---|---|---|---|
| MoneyPrinterTurbo | MIT | Sí | Sí |
| Hyperframes | Apache 2.0 | Sí | Sí |
| OpenMontage | AGPLv3 | Sí (publicar los videos no obliga a nada) | Ofrecerlo como servicio obliga a publicar su código modificado. Por eso Geeper lo llama como **proceso aparte por CLI y archivos**, sin importar su código; sus pipelines se reescriben en `geeper.json` cuando se usen mucho |
| Remotion | Licencia Remotion | Gratis para personas y empresas de hasta 3 empleados (verificar el número de Dimerso) | Requiere licencia de empresa: se cotiza antes. Por eso Hyperframes es el compositor principal |
| Wan 2.2 TI2V-5B | Apache 2.0 (verificado en la ficha del modelo) | Sí | Sí |
| Kokoro / Piper / whisper | Apache 2.0 / MIT (la rama `piper1-gpl` es GPL: no se enlaza) / MIT | Sí | Sí |
| RealVisXL, DreamShaper, QR Monster | Variantes de OpenRAIL (con restricciones de uso, comerciales OK) | Sí | Revisar cada modelo |
| ffmpeg | LGPL/GPL según el build | Se usa como binario aparte | Igual |
| Fuentes, música, material de archivo | Por asset | Registro obligatorio en `Asset.licencia` | Igual |

Geeper mantiene `MODELOS.md` (modelo, origen, licencia, uso comercial sí/no) y un SBOM desde F1.

## 10. Costo

| Concepto | Hoy | Con Geeper |
|---|---|---|
| Servicios recurrentes | US$0 | **US$0** (nada nuevo en la nube) |
| Hardware | RTX 5080 existente | Igual |
| Electricidad | — | Lo que consuma la GPU al generar (Wan ~285 W) |
| APIs pagas | No | No; opcionales y apagadas si algún día se agregan |

## 11. Fases

| Fase | Entrega | Cuándo termina |
|---|---|---|
| **F0** | Este documento aprobado | Decisiones de §13 tomadas |
| **F1 — Base + Fábrica** | Repo, esquema `geeper.json` v1, orquestador con cola SQLite, workers MPT / Hyperframes / ffmpeg, `mpt-acabado` convertido en compilador, biblioteca de renders, QC automático de sonoridad, color e integridad | Un lote de 10 temas sale acabado y con QC aprobado desde la UI, y sobrevive a un reinicio a mitad |
| **F2 — Pieza premium** | Flujo de Claude con la skill `geeper` (guion y storyboard con aprobación), worker Wan por plano, voz Kokoro por escena, regenerar una escena sin rehacer el resto | Un video de 60 s con ≥ 4 planos Wan, aprobado por la persona |
| **F3 — Editor** | Línea de tiempo (recortar, mover, cambiar voz, texto, música), pulsos de la música, cambio de formato 9:16 ↔ 16:9, historial de versiones | Reeditar una pieza de F2 en otro formato en < 10 min |
| **F4 — Lanzamientos y revisión visual** | `brag` integrado como flujo, QC con modelo de visión local, plantillas de marca de cada producto Dimerso | Video de lanzamiento de un producto Dimerso con QC completo |
| **F5 — Opcionales** | Localización, publicación en YouTube, 4K | Según demanda |

El modelo de datos nace sabiendo que un clip puede venir de MPT, Wan, TTS o un archivo, así F2 y
F3 no obligan a rehacer F1.

## 12. Riesgos

| Riesgo | Mitigación |
|---|---|
| Reinicios de Windows en mitad de un trabajo de GPU | §8; no reintentar solo; telemetría con `con-telemetria` |
| 16 GB de VRAM: Wan solo hasta 576×1024 en bf16 | Generar a 576×1024 y escalar en la composición; 720p en fp8 cuando esté medido |
| Wan lento (~5 min por 2 s) | Sólo para planos clave; el resto, material de MPT o de archivo |
| Herramientas en tres entornos (Docker, venv, npx) | Un worker por motor con su comando de salud; `geeper doctor` como el `dev:doctor` de Farol |
| Hyperframes es joven (0.9) | Fijar la versión; `geeper.json` permite cambiar de compositor |
| Puerto 3000 compartido con Farol y Remotion | Geeper en su propio puerto (p. ej. 3300) |
| Calidad «de fábrica» en la voz TTS | Elegir voz por marca y medirla en QC; voz grabada como `source: archivo` cuando importe |

## 13. Decisiones pendientes (del dueño)

1. **Dónde vive el repo:** `~/dev/dimerso/products/geeper` como repo propio (propuesto) o dentro de
   `platform`.
2. **Primer uso real** para validar F1: ¿el canal «GTA VI Shorts», videos de Farol o los dos?
3. **Plantillas de marca** iniciales: ¿qué canales o productos?
4. **Tamaño de Dimerso** para la licencia de Remotion (≤ 3 personas = gratis).

## Anexo: segunda opinión (Nemotron Ultra, 2026-11-17)

**Aceptado:** `geeper.json` propio basado en OpenTimelineIO en lugar de HTML de Hyperframes como
fuente de verdad; workers en procesos aparte con `input_hash` y manifiestos; compuerta de QC con
`loudnorm` en dos pasadas, etiquetas Rec.709, detección de fotogramas dañados y legibilidad de
subtítulos; ritmo alineado a la música; el modelo de datos con clips generativos desde F1; Claude
fuera del camino de render; aislar OpenMontage como CLI; registro de licencias de modelos y SBOM.

**Descartado o corregido:**
- *«Wan 2.2 probablemente no sea comercial»*: falso, la ficha del modelo descargado dice Apache 2.0.
- *«El `gpu-lock` de archivo queda bloqueado si el proceso muere; usar Redis con TTL»*: no aplica,
  es `flock` y lo suelta el kernel. Además Redis sumaría un servicio.
- *«Sacar MPT de Docker»*: funciona y está verificado con GPU; moverlo es costo sin beneficio medido.
- *ACES/OCIO y composición tipográfica con HarfBuzz/Knuth-Plass*: desproporcionado para material
  generado en sRGB; Chrome ya hace el *shaping* con HarfBuzz. Basta con exportar en Rec.709 y bien
  etiquetado.
- *Preview con Remotion Player*: agrega una licencia sin necesidad; se usan Hyperframes y proxies.
- *Cifras de licencia de Remotion para SaaS*: no verificadas; se cotiza si llega el caso.
