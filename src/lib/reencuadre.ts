/**
 * Reencuadre 16:9 → 9:16 siguiendo la cara (BRECHAS.md E4), para clips importados y para cualquier
 * video horizontal de un proyecto (p. ej. un clip propio subido a una escena). La detección la hace
 * py/reencuadre.py (OpenCV + YuNet); el resultado se hornea con ffmpeg en un asset nuevo.
 */
import path from "node:path";
import { describirAsset, guardarProyecto, registrarAssetsEnDb } from "./almacen";
import { validarProyecto, pista, type Asset, type Proyecto } from "./esquema";
import { PYTHON_CLIPS } from "./fuentes";
import { ffmpeg, huellaFfmpeg } from "./media";
import { paso, type Contexto } from "./pasos";
import { correr } from "./proceso";
import { RAIZ_REPO } from "./rutas";

export type LayoutReencuadre = "react" | "cara";

export interface Deteccion {
  ok: boolean;
  filtro?: string;
  params?: Record<string, unknown>;
  resumen?: string;
  motivo?: string;
}

export async function detectar(video: string, layout: LayoutReencuadre): Promise<Deteccion> {
  const r = await correr(PYTHON_CLIPS, ["-I", path.join(RAIZ_REPO, "py", "reencuadre.py")], {
    entrada: JSON.stringify({ op: "reencuadre", video, layout }),
  });
  return JSON.parse(r.stdout) as Deteccion;
}

/** Hornea el filtro sobre el video entero en `salida` (paso con manifiesto). */
export async function hornear(ctx: Contexto, video: string, filtro: string, salida: string): Promise<void> {
  const ff = await huellaFfmpeg();
  await paso(ctx, "visual.reencuadre", { archivos: [video], params: { filtro }, motor: `reencuadre-v1+${ff}` }, [salida], async ([tmp]) => {
    await ffmpeg(["-i", video, "-filter_complex", filtro, "-map", "[v]", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-g", "30", "-pix_fmt", "yuv420p", "-an", tmp!], ctx.log);
    return {};
  });
}

/**
 * Reencuadra el video de una escena y lo reemplaza en todas las escenas que usan ese mismo video
 * (un clip importado usa uno solo). Conserva rangos, sincro y efectos; quita el ajuste (ya es 9:16).
 */
export async function reencuadrarEscena(ctx: Contexto, proyectoId: string, original: Proyecto, escena: string, layout: LayoutReencuadre) {
  if (original.formato !== "9:16") throw new Error("El reencuadre siguiendo la cara es para 9:16: cambia el formato primero");
  const clip = pista(original, "visual").clips.find((c) => c.escena === escena);
  if (!clip) throw new Error(`No existe la escena ${escena}`);
  const a = original.assets[clip.asset]!;
  if (a.tipo !== "video") throw new Error("La escena no tiene video: sólo se reencuadran videos");
  if (a.ancho && a.alto && a.ancho <= a.alto) throw new Error("Ese video ya es vertical: no hace falta reencuadrarlo");
  const video = path.join(ctx.dir, a.ruta);
  const det = await detectar(video, layout);
  if (!det.ok || !det.filtro) throw new Error(`No se pudo reencuadrar (${layout}): ${det.motivo ?? "sin detalle"}`);
  ctx.log(`Reencuadre ${layout}: ${det.resumen}`);
  const id = `${a.id.replace(/-(react|cara)$/, "")}-${layout}`.slice(0, 80);
  const ruta = `assets/${id}.mp4`;
  await hornear(ctx, video, det.filtro, path.join(ctx.dir, ruta));
  const nuevo: Asset = await describirAsset(ctx.dir, ruta, {
    id,
    tipo: "video",
    source: a.source,
    licencia: a.licencia,
    regenerar: { ...a.regenerar, reencuadreDe: a.id, encuadre: layout, reencuadre: det.params ?? null },
  });
  const p = structuredClone(original);
  p.assets[id] = nuevo;
  let n = 0;
  for (const c of pista(p, "visual").clips) {
    if (c.asset !== a.id) continue;
    c.asset = id;
    delete c.ajuste;
    delete c.ancla;
    n++;
  }
  if (layout === "react") p.marca = false;
  const clipOrigen = p.origen.clip as Record<string, unknown> | undefined;
  if (clipOrigen) p.origen.clip = { ...clipOrigen, encuadre: layout, reencuadre: det.resumen };
  const final = validarProyecto(p);
  const version = await guardarProyecto(proyectoId, final, `Reencuadre ${layout} (${n} ${n === 1 ? "escena" : "escenas"})`);
  await registrarAssetsEnDb(proyectoId, final);
  return { version, escenas: n, resumen: det.resumen };
}
