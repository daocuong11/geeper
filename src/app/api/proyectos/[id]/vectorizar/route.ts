import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { describirAsset, guardarProyecto, registrarAssetsEnDb } from "@/lib/almacen";
import { db } from "@/lib/db";
import { json, manejar } from "@/lib/http";
import { cambiarAsset } from "@/lib/nitidez";
import { versionDeProyecto } from "@/lib/render";
import { dirProyecto, VECTORCRAFT_VERSION } from "@/lib/rutas";
import { vectorizar } from "@/lib/vectorcraft";

const Cuerpo = z.object({ asset: z.string().regex(/^[a-z0-9-]+$/) });

/**
 * Vectoriza una imagen del proyecto (un logo PNG que se ve borroso) con VectorCraft y la reemplaza por el
 * SVG en todos sus clips. Queda como versión nueva: se deshace desde Historial.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    const { id } = await ctx.params;
    const { asset: assetId } = Cuerpo.parse(await req.json());
    const fila = await db.proyecto.findUniqueOrThrow({ where: { id } });
    const dir = dirProyecto(fila.slug);
    const { p } = await versionDeProyecto(id);
    const original = p.assets[assetId];
    if (!original) throw new Error("Esa imagen ya no está en el proyecto");
    if (original.tipo !== "imagen") throw new Error("Sólo se vectoriza una imagen (un logo o ícono), no un video");

    const { svg, avisos } = await vectorizar(await fs.readFile(path.join(dir, original.ruta)), original.ruta);
    const hash = createHash("sha256").update(svg).digest("hex");
    const nuevoId = `vector-${hash.slice(0, 12)}`;
    const ruta = `assets/${nuevoId}.svg`;
    await fs.writeFile(path.join(dir, `${ruta}.tmp`), svg);
    await fs.rename(path.join(dir, `${ruta}.tmp`), path.join(dir, ruta));
    const nuevo = await describirAsset(dir, ruta, {
      id: nuevoId,
      tipo: "imagen",
      source: original.source,
      licencia: original.licencia,
      regenerar: { desde: original.id, vectorizado: `VectorCraft ${VECTORCRAFT_VERSION} (Image Trace)` },
    });
    const nombre = String(original.regenerar.nombreOriginal ?? path.basename(original.ruta));
    const proyecto = cambiarAsset(p, original.id, nuevo);
    const n = await guardarProyecto(id, proyecto, `Vectorizado: ${nombre} (se deshace desde Historial)`);
    await registrarAssetsEnDb(id, proyecto);
    return json({ version: n, asset: nuevoId, avisos }, 201);
  });
}
