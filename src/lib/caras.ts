/**
 * Reencuadre automático siguiendo la cara (BRECHAS.md E4).
 *
 * Al importar (o con `scripts/analizar-caras.ts`), YuNet busca la cara principal de cada clip visual y
 * guarda su punto en `asset.foco`. El compilador lo usa cuando el clip no fija un ancla: si la cara es
 * estable y entra en el recorte, el clip *cubre* el cuadro centrado en ella en vez de quedar «contenido»
 * con el fondo desenfocado (que es lo que pasa hoy con un clip 16:9 en un proyecto 9:16).
 *
 * Modelo: YuNet 2023mar de OpenCV Zoo, el mismo que fija LightCraft (storytold/lightcraft,
 * `crates/faces/src/known.rs`): dirección fijada a un commit, tamaño y SHA-256 comprobados, descarga a
 * `.part` y rename. Corre con el OpenCV del venv `geeper-clips` (`cv2.FaceDetectorYN`), en CPU.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { escribirAtomico, existe, rutaTemporal, sha256Archivo } from "./archivos";
import { Foco, pista, type Asset, type Clip, type Proyecto } from "./esquema";
import { escenasEnLinea } from "./linea";
import type { Contexto } from "./pasos";
import { correr } from "./proceso";
import { esSvg } from "./svg";
import { pythonDeVenv } from "./plataforma";
import { dirDatos, RAIZ_REPO, VENV_CLIPS } from "./rutas";

export const YUNET = {
  id: "yunet-2023mar",
  url: "https://github.com/opencv/opencv_zoo/raw/25f423d0e04c31a17254620e58febd7386da523b/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
  archivo: "face_detection_yunet_2023mar.onnx",
  tamano: 232_589,
  sha256: "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
  licencia: "MIT (Shiqi Yu, OpenCV Zoo). Entrenado con WIDER FACE, cuyos términos no cubre la licencia MIT de los pesos. Detecta caras, no identifica a nadie.",
} as const;

/** Puntaje mínimo: las caras falsas de videojuegos dan 0,6–0,75 (HEREDADO.md, facecam). */
export const PUNTAJE_MIN = 0.8;

export const rutaYunet = () => path.join(dirDatos(), "modelos", YUNET.archivo);
/** Para los scripts que buscan YuNet por su cuenta (py/facecam.py): la misma carpeta que usa Geeper. */
export const envModelos = () => ({ GEEPER_MODELOS: path.dirname(rutaYunet()) });

/** Python con OpenCV ≥ 4.8 (trae FaceDetectorYN). */
export const PYTHON_CARAS =
  process.env.GEEPER_CARAS_PYTHON ?? pythonDeVenv(VENV_CLIPS);

/** Deja YuNet en disco, comprobado por tamaño y SHA-256. Devuelve la ruta. */
export async function asegurarYunet(log?: (l: string) => void): Promise<string> {
  const ruta = rutaYunet();
  if ((await existe(ruta)) && (await sha256Archivo(ruta)) === YUNET.sha256) return ruta;
  await fs.mkdir(path.dirname(ruta), { recursive: true });
  log?.(`Descargando ${YUNET.id} (${Math.round(YUNET.tamano / 1024)} KB, ${YUNET.licencia.split(".")[0]})`);
  const r = await fetch(YUNET.url, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`No pude descargar ${YUNET.id}: HTTP ${r.status}`);
  const datos = Buffer.from(await r.arrayBuffer());
  if (datos.length !== YUNET.tamano) throw new Error(`${YUNET.id}: llegaron ${datos.length} bytes, se esperaban ${YUNET.tamano}`);
  const tmp = rutaTemporal(ruta);
  await fs.writeFile(tmp, datos);
  if ((await sha256Archivo(tmp)) !== YUNET.sha256) {
    await fs.rm(tmp, { force: true });
    throw new Error(`${YUNET.id}: el SHA-256 no coincide con el fijado; descarté el archivo`);
  }
  await fs.rename(tmp, ruta);
  return ruta;
}

const SalidaPy = z.record(
  z.string(),
  z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      ancho: z.number().min(0).max(1),
      confianza: z.number().min(0).max(1),
      cobertura: z.number().min(0).max(1),
      dispersion: z.number().min(0).max(1),
      muestras: z.number().int().positive(),
    })
    .nullable(),
);

/** Assets visuales que vale la pena analizar: video o imagen usados en una pista de video, sin foco aún. */
export function porAnalizar(p: Proyecto): Asset[] {
  const usados = new Set(p.pistas.filter((t) => t.tipo === "video").flatMap((t) => t.clips.map((c) => c.asset)));
  // Un SVG (logo, rótulo) no tiene caras y OpenCV no lo lee.
  return Object.values(p.assets).filter((a) => usados.has(a.id) && (a.tipo === "video" || a.tipo === "imagen") && !a.foco && !esSvg(a.ruta));
}

/** Corre YuNet sobre `assets` (rutas relativas a ctx.dir). null = sin cara confiable. */
export async function detectarCaras(ctx: Contexto, assets: Asset[], signal?: AbortSignal): Promise<Record<string, Omit<Foco, "modelo"> | null>> {
  if (!assets.length) return {};
  const modelo = await asegurarYunet(ctx.log);
  const entrada = JSON.stringify({
    modelo,
    puntaje: PUNTAJE_MIN,
    muestras: 40,
    archivos: assets.map((a) => ({ id: a.id, ruta: path.join(ctx.dir, a.ruta), tipo: a.tipo })),
  });
  const r = await correr(PYTHON_CARAS, ["-I", path.join(RAIZ_REPO, "py", "caras.py")], { entrada, signal, timeout: 10 * 60_000 });
  return SalidaPy.parse(JSON.parse(r.stdout));
}

/** Copia de `p` con el foco de cada asset detectado (los null no se anotan). */
export function aplicarFocos(p: Proyecto, focos: Record<string, Omit<Foco, "modelo"> | null>): Proyecto {
  const assets = { ...p.assets };
  for (const [id, f] of Object.entries(focos)) {
    const a = assets[id];
    if (a && f) assets[id] = { ...a, foco: { ...f, modelo: YUNET.id } };
  }
  return { ...p, assets };
}

// ---- Caché por archivo y análisis automático de proyectos viejos ----

/**
 * `<proyecto>/caras.json`: lo que YuNet encontró en cada archivo (por su sha256, null = sin cara) y si el
 * análisis automático ya se aplicó a este proyecto. Vive fuera de geeper.json para que restaurar una
 * versión del historial no dispare otro análisis que la cambie.
 */
const Cache = z.object({
  autoAplicado: z.boolean().default(false),
  focos: z.record(z.string(), Foco.omit({ modelo: true }).nullable()).default({}),
});
type Cache = z.infer<typeof Cache>;

const rutaCache = (dir: string) => path.join(dir, "caras.json");

async function leerCache(dir: string): Promise<Cache> {
  try {
    return Cache.parse(JSON.parse(await fs.readFile(rutaCache(dir), "utf8")));
  } catch {
    return { autoAplicado: false, focos: {} };
  }
}

/** ¿Falta el análisis automático de este proyecto? (lo pide la UI al abrirlo). */
export async function faltaAuto(dir: string): Promise<boolean> {
  return !(await leerCache(dir)).autoAplicado;
}

/** Marca el proyecto como ya analizado (la importación nace analizada). */
export async function marcarAuto(dir: string): Promise<void> {
  const c = await leerCache(dir);
  await escribirAtomico(rutaCache(dir), JSON.stringify({ ...c, autoAplicado: true }, null, 2));
}

export interface ResultadoFocos {
  p: Proyecto;
  /** Mensaje de error si no se pudo analizar (el proyecto vuelve sin cambios). */
  fallo?: string;
}

/**
 * Pone el foco a los assets que falten (todos, o sólo `ids`), reusando el caché por sha256.
 * Nunca bloquea: si falla, lo dice y devuelve el proyecto como estaba.
 */
export async function conFocos(ctx: Contexto, p: Proyecto, op: { ids?: string[]; signal?: AbortSignal } = {}): Promise<ResultadoFocos> {
  const pendientes = porAnalizar(p).filter((a) => !op.ids || op.ids.includes(a.id));
  if (!pendientes.length) return { p };
  try {
    const cache = await leerCache(ctx.dir);
    const nuevos = pendientes.filter((a) => !(a.hash in cache.focos));
    if (nuevos.length) {
      const t0 = Date.now();
      const det = await detectarCaras(ctx, nuevos, op.signal);
      for (const a of nuevos) cache.focos[a.hash] = det[a.id] ?? null;
      const n = nuevos.filter((a) => cache.focos[a.hash]).length;
      ctx.log(`Caras (YuNet): ${n} de ${nuevos.length} clips con cara, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      await escribirAtomico(rutaCache(ctx.dir), JSON.stringify(cache, null, 2));
    }
    return { p: aplicarFocos(p, Object.fromEntries(pendientes.map((a) => [a.id, cache.focos[a.hash] ?? null]))) };
  } catch (e) {
    if (op.signal?.aborted) throw e;
    const fallo = (e as Error).message.split("\n")[0]!;
    ctx.log(`Aviso: no pude buscar caras (${fallo}); el encuadre queda como antes`);
    return { p, fallo };
  }
}

/**
 * Análisis automático de un proyecto que nunca se analizó: una sola vez por proyecto. Devuelve el
 * proyecto nuevo y las escenas cuyo encuadre cambia (para avisarle a la persona), o null si no toca.
 */
export async function autoCaras(ctx: Contexto, p: Proyecto, W: number, H: number): Promise<{ p: Proyecto; escenas: string[] } | null> {
  if (!(await faltaAuto(ctx.dir))) return null;
  const r = await conFocos(ctx, p);
  if (r.fallo) return null; // se reintenta la próxima vez que se abra
  await marcarAuto(ctx.dir);
  return { p: r.p, escenas: escenasQueCambian(p, r.p, W, H) };
}

// ---- Encuadre (puro: lo usa el compilador) ----

/** Dónde queda la cara en el cuadro final: centrada a lo ancho, con aire arriba (tercio superior). */
const OBJETIVO = { x: 0.5, y: 0.4 };

interface Recorte {
  /** Fracción del ancho y del alto del asset que se ve al cubrir. */
  vx: number;
  vy: number;
  /** Desborde (px de pantalla) al cubrir; 0 = ese eje no se recorta. */
  ox: number;
  oy: number;
  Ws: number;
  Hs: number;
}

function recorte(a: Asset, W: number, H: number): Recorte | null {
  if (!a.ancho || !a.alto) return null;
  const s = Math.max(W / a.ancho, H / a.alto);
  const Ws = a.ancho * s;
  const Hs = a.alto * s;
  return { vx: W / Ws, vy: H / Hs, ox: Ws - W, oy: Hs - H, Ws, Hs };
}

/**
 * ¿Se puede cubrir siguiendo la cara? Sí si la cara aparece en la mitad de las muestras o más, ocupa
 * como mucho el 60 % del ancho visible y se mueve menos de un cuarto de lo visible (así no se sale).
 */
export function cubreConCara(a: Asset, W: number, H: number): boolean {
  const f = a.foco;
  const r = recorte(a, W, H);
  if (!f || !r) return false;
  return f.cobertura >= 0.5 && f.ancho <= 0.6 * r.vx && f.dispersion <= r.vx / 4;
}

/** `object-position` (0..1 por eje) que pone la cara en OBJETIVO (limitado al borde del asset). */
function puntoCara(a: Asset, W: number, H: number): { px: number; py: number } | null {
  const f = a.foco;
  const r = recorte(a, W, H);
  if (!f || !r) return null;
  const eje = (centro: number, escalado: number, lado: number, desborde: number, objetivo: number) =>
    desborde < 0.5 ? 0.5 : Math.min(1, Math.max(0, (centro * escalado - objetivo * lado) / desborde));
  return { px: eje(f.x, r.Ws, W, r.ox, OBJETIVO.x), py: eje(f.y, r.Hs, H, r.oy, OBJETIVO.y) };
}

/** `object-position` en CSS para seguir la cara. */
export function posicionCara(a: Asset, W: number, H: number): string | null {
  const q = puntoCara(a, W, H);
  return q ? `object-position: ${(q.px * 100).toFixed(2)}% ${(q.py * 100).toFixed(2)}%;` : null;
}

/** Si el clip sigue la cara: sin ancla fijada a mano y con un foco detectado. */
export const sigueCara = (c: Clip, a: Asset) => c.ancla === undefined && a.foco !== undefined;

/** Decide cubrir/contener: con una cara estable, cubrir siguiéndola; si no, contener cuando la relación de aspecto difiere mucho. */
export function ajusteDe(c: Clip, a: Asset, W: number, H: number): "cubrir" | "contener" {
  if (c.ajuste) return c.ajuste;
  if (!a.ancho || !a.alto) return "cubrir";
  if (sigueCara(c, a) && cubreConCara(a, W, H)) return "cubrir";
  const r = a.ancho / a.alto / (W / H);
  return Math.max(r, 1 / r) > 1.4 ? "contener" : "cubrir";
}

/** Lo que se ve del asset, en fracciones de su cuadro; `todo` = contenido entero con fondo borroso. */
export type Visible = { todo: true } | { todo: false; x: number; y: number; w: number; h: number };

/** El mismo cálculo que el compilador, para dibujar la vista previa del encuadre. */
export function visibleDe(c: Pick<Clip, "ajuste" | "ancla">, a: Asset, W: number, H: number): Visible {
  const clip = c as Clip;
  if (ajusteDe(clip, a, W, H) === "contener") return { todo: true };
  const r = recorte(a, W, H);
  if (!r) return { todo: false, x: 0, y: 0, w: 1, h: 1 };
  const cara = sigueCara(clip, a) ? puntoCara(a, W, H) : null;
  const ancla = c.ancla ?? "centro";
  const px = cara?.px ?? 0.5;
  const py = cara?.py ?? (ancla === "arriba" ? 0 : ancla === "abajo" ? 1 : 0.5);
  const red = (v: number) => Math.round(v * 10_000) / 10_000;
  return { todo: false, x: red(px * (1 - r.vx)), y: red(py * (1 - r.vy)), w: red(r.vx), h: red(r.vy) };
}

/** Opciones del selector «¿Qué se ve?», en palabras simples. */
export const OPCIONES_ENCUADRE = [
  { id: "auto", etiqueta: "Automático", ayuda: "Geeper elige: sigue la cara si la hay; si el clip no cabe, lo muestra entero.", ajuste: undefined, ancla: undefined },
  { id: "cara", etiqueta: "Seguir la cara", ayuda: "Llena la pantalla con la cara al centro.", ajuste: "cubrir", ancla: undefined },
  { id: "centro", etiqueta: "El centro", ayuda: "Llena la pantalla y recorta los bordes.", ajuste: "cubrir", ancla: "centro" },
  { id: "arriba", etiqueta: "La parte de arriba", ayuda: "Llena la pantalla y conserva lo de arriba.", ajuste: "cubrir", ancla: "arriba" },
  { id: "abajo", etiqueta: "La parte de abajo", ayuda: "Llena la pantalla y conserva lo de abajo.", ajuste: "cubrir", ancla: "abajo" },
  { id: "todo", etiqueta: "Todo, con fondo borroso", ayuda: "Se ve el clip completo, más chico, sobre una copia borrosa.", ajuste: "contener", ancla: undefined },
] as const satisfies readonly { id: string; etiqueta: string; ayuda: string; ajuste?: "cubrir" | "contener"; ancla?: "centro" | "arriba" | "abajo" }[];

const igual = (a: Visible, b: Visible) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Opciones que tienen sentido para este clip (sin cara no hay «Seguir la cara»; las que darían el mismo
 * recorte que otra anterior se omiten) con lo que se vería en cada una, y cuál está elegida.
 */
export function encuadreDe(c: Clip, a: Asset, W: number, H: number) {
  const opciones: { id: string; etiqueta: string; ayuda: string; ajuste: string | null; ancla: string | null; visible: Visible }[] = [];
  for (const o of OPCIONES_ENCUADRE) {
    if (o.id === "cara" && !a.foco) continue;
    const visible = visibleDe({ ajuste: o.ajuste, ancla: o.ancla }, a, W, H);
    if (o.id !== "auto" && opciones.some((x) => x.id !== "auto" && igual(x.visible, visible))) continue;
    opciones.push({ id: o.id, etiqueta: o.etiqueta, ayuda: o.ayuda, ajuste: o.ajuste ?? null, ancla: o.ancla ?? null, visible });
  }
  let elegida = OPCIONES_ENCUADRE.find((o) => o.ajuste === c.ajuste && o.ancla === c.ancla)?.id ?? (c.ajuste === undefined ? "auto" : c.ancla === undefined ? "centro" : "auto");
  const actual = visibleDe(c, a, W, H);
  // Sin ajuste pero con ancla (p. ej. tras «Dejar como estaba»): no es «Automático» aunque ninguna
  // opción calce exacto; se marca la que da el mismo recorte que se ve.
  if (elegida === "auto" && c.ajuste === undefined && c.ancla !== undefined) {
    elegida = (opciones.find((o) => o.id !== "auto" && igual(o.visible, actual))?.id as typeof elegida | undefined) ?? elegida;
  }
  return {
    elegida: opciones.some((o) => o.id === elegida) ? elegida : "auto",
    actual,
    cara: a.foco ? { x: a.foco.x, y: a.foco.y } : null,
    siguiendoCara: sigueCara(c, a) && ajusteDe(c, a, W, H) === "cubrir",
    opciones,
  };
}

/** Escenas cuyo recorte cambia entre dos versiones (lo que el aviso le cuenta a la persona). */
export function escenasQueCambian(antes: Proyecto, despues: Proyecto, W: number, H: number): string[] {
  return escenasEnLinea(despues)
    .filter((e) => {
      const a0 = antes.assets[e.visual.asset];
      const a1 = despues.assets[e.visual.asset]!;
      return !a0 || !igual(visibleDe(e.visual, a0, W, H), visibleDe(e.visual, a1, W, H));
    })
    .map((e) => e.escena.id);
}

/** «Dejar como estaba»: las escenas vuelven al encuadre previo a seguir caras (ancla al centro). */
export function sinSeguirCaras(p: Proyecto, escenas: string[]): Proyecto {
  const visual = pista(p, "visual");
  const clips = visual.clips.map((c) => (c.escena && escenas.includes(c.escena) && c.ancla === undefined ? { ...c, ancla: "centro" as const } : c));
  return { ...p, pistas: p.pistas.map((t) => (t.id === visual.id ? { ...visual, clips } : t)) };
}
