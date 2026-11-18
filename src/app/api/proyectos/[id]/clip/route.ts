import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { describirAsset, guardarProyecto, registrarAssetsEnDb } from "@/lib/almacen";
import { db } from "@/lib/db";
import { reemplazarVisual } from "@/lib/ediciones";
import { json, manejar } from "@/lib/http";
import { LICENCIAS } from "@/lib/licencias";
import { versionDeProyecto } from "@/lib/render";
import { dirProyecto } from "@/lib/rutas";

const EXT = new Set([".mp4", ".mov", ".webm", ".m4v", ".jpg", ".jpeg", ".png", ".webp"]);
const MAX = 2 * 1024 ** 3;

/** Reemplaza el clip de una escena por un archivo propio (video o imagen). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    const { id } = await ctx.params;
    const form = await req.formData();
    const escena = String(form.get("escena") ?? "");
    const archivo = form.get("archivo");
    if (!(archivo instanceof File)) throw new Error("Falta el archivo");
    if (archivo.size > MAX) throw new Error("El archivo pasa de 2 GB");
    const ext = path.extname(archivo.name).toLowerCase();
    if (!EXT.has(ext)) throw new Error(`Formato no admitido: ${ext || "sin extensión"}`);
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
      tipo: [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? "imagen" : "video",
      source: "archivo",
      licencia: LICENCIAS.archivo!,
      regenerar: { nombreOriginal: archivo.name },
    });
    const { p } = await versionDeProyecto(id);
    const nuevo = reemplazarVisual(p, escena, asset);
    const n = await guardarProyecto(id, nuevo, `Clip propio en ${escena}: ${archivo.name}`);
    await registrarAssetsEnDb(id, nuevo);
    return json({ version: n, asset: assetId }, 201);
  });
}
