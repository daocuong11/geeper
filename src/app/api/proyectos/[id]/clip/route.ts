import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { describirAsset, guardarProyecto, registrarAssetsEnDb } from "@/lib/almacen";
import { db } from "@/lib/db";
import { aplicarEdicion, registrarAsset, reemplazarVisual } from "@/lib/ediciones";
import { json, manejar } from "@/lib/http";
import { LICENCIAS } from "@/lib/licencias";
import { versionDeProyecto } from "@/lib/render";
import { dirProyecto } from "@/lib/rutas";

const IMAGEN = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const VIDEO = new Set([".mp4", ".mov", ".webm", ".m4v"]);
const AUDIO = new Set([".mp3", ".wav", ".m4a", ".ogg", ".flac"]);
const MAX = 2 * 1024 ** 3;

/**
 * Sube un archivo propio (video, imagen o audio) y:
 *  - con `escena`: reemplaza el clip visual de esa escena,
 *  - con `pista` e `inicio`: lo agrega a una pista libre (superposición de video o efecto de sonido)
 *    en ese segundo de la línea de tiempo, con la licencia que diga `licencia` (por defecto, propia).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    const { id } = await ctx.params;
    const form = await req.formData();
    const escena = String(form.get("escena") ?? "");
    const pista = String(form.get("pista") ?? "");
    const archivo = form.get("archivo");
    if (!(archivo instanceof File)) throw new Error("Falta el archivo");
    if (archivo.size > MAX) throw new Error("El archivo pasa de 2 GB");
    const ext = path.extname(archivo.name).toLowerCase();
    const libre = Boolean(pista);
    if (!IMAGEN.has(ext) && !VIDEO.has(ext) && !(libre && AUDIO.has(ext))) throw new Error(`Formato no admitido: ${ext || "sin extensión"}`);
    if (!libre && !escena) throw new Error("Falta la escena o la pista");
    const licencia = String(form.get("licencia") ?? "").trim() || LICENCIAS.archivo!;
    const fila = await db.proyecto.findUniqueOrThrow({ where: { id } });
    const dir = dirProyecto(fila.slug);
    const datos = Buffer.from(await archivo.arrayBuffer());
    const hash = createHash("sha256").update(datos).digest("hex");
    const assetId = `subido-${hash.slice(0, 12)}`;
    const ruta = `assets/${assetId}${ext}`;
    const tmp = path.join(dir, `${ruta}.tmp`);
    await fs.mkdir(path.join(dir, "assets"), { recursive: true });
    await fs.writeFile(tmp, datos);
    await fs.rename(tmp, path.join(dir, ruta));
    const asset = await describirAsset(dir, ruta, {
      id: assetId,
      tipo: IMAGEN.has(ext) ? "imagen" : AUDIO.has(ext) ? "audio" : "video",
      source: "archivo",
      licencia,
      regenerar: { nombreOriginal: archivo.name },
    });
    const { p } = await versionDeProyecto(id);
    let nuevo;
    let nota;
    if (libre) {
      const inicio = Number(form.get("inicio") ?? 0);
      const duracion = form.get("duracion") ? Number(form.get("duracion")) : undefined;
      nuevo = aplicarEdicion(registrarAsset(p, asset), {
        tipo: "agregarClipLibre", pista, asset: assetId, inicio, duracion, desde: 0,
        volumen: asset.tipo === "audio" ? 1 : undefined,
        transicion: asset.tipo !== "audio" ? { tipo: "fundido", duracion: 0.3 } : undefined,
      });
      nota = `${asset.tipo === "audio" ? "Efecto de sonido" : "Superposición"} en ${pista} (${inicio.toFixed(1)} s): ${archivo.name}`;
    } else {
      nuevo = reemplazarVisual(p, escena, asset);
      nota = `Clip propio en ${escena}: ${archivo.name}`;
    }
    const n = await guardarProyecto(id, nuevo, nota);
    await registrarAssetsEnDb(id, nuevo);
    return json({ version: n, asset: assetId }, 201);
  });
}
