import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { describirAsset, guardarProyecto, registrarAssetsEnDb } from "@/lib/almacen";
import { conFocos } from "@/lib/caras";
import { db } from "@/lib/db";
import { reemplazarVisual } from "@/lib/ediciones";
import { json, manejar } from "@/lib/http";
import { versionDeProyecto } from "@/lib/render";
import { dirProyecto } from "@/lib/rutas";
import { dirCorrida, leerCorrida } from "@/lib/workflows";

export const dynamic = "force-dynamic";

const Pedido = z.object({
  corrida: z.string().regex(/^[a-z0-9-]+$/),
  archivo: z.string().regex(/^[\w.-]+$/),
  proyecto: z.string().min(1),
  escena: z.string().min(1),
});

/** Pone una imagen o un video que salió de un workflow como el visual de una escena de un proyecto. */
export async function POST(req: Request) {
  return manejar(async () => {
    const pedido = Pedido.parse(await req.json());
    const c = await leerCorrida(pedido.corrida);
    const salida = c?.salidas.find((s) => s.archivo === pedido.archivo);
    if (!c || !salida) throw new Error("Ese resultado ya no está.");
    if (salida.tipo !== "imagen" && salida.tipo !== "video") throw new Error("Solo una imagen o un video puede ir en una escena.");
    const origen = path.join(dirCorrida(c.id), salida.archivo);
    if (!existsSync(origen)) throw new Error("Ese resultado ya no está en el disco.");
    const fila = await db.proyecto.findUniqueOrThrow({ where: { id: pedido.proyecto } });
    const dir = dirProyecto(fila.slug);
    const datos = await fs.readFile(origen);
    const ext = path.extname(salida.archivo).toLowerCase();
    const assetId = `workflow-${createHash("sha256").update(datos).digest("hex").slice(0, 12)}`;
    const ruta = `assets/${assetId}${ext}`;
    await fs.mkdir(path.join(dir, "assets"), { recursive: true });
    await fs.writeFile(path.join(dir, `${ruta}.tmp`), datos);
    await fs.rename(path.join(dir, `${ruta}.tmp`), path.join(dir, ruta));
    const asset = await describirAsset(dir, ruta, {
      id: assetId,
      tipo: salida.tipo,
      source: "archivo",
      licencia: `Generado en esta PC con ComfyUI (receta «${c.titulo}»): revisa la licencia de sus modelos antes de publicar`,
      regenerar: { nombreOriginal: salida.archivo, workflow: c.workflow, corrida: c.id },
    });
    const { p } = await versionDeProyecto(pedido.proyecto);
    if (!p.escenas[pedido.escena]) throw new Error("Esa escena ya no existe en el proyecto.");
    let nuevo = reemplazarVisual(p, pedido.escena, asset);
    nuevo = (await conFocos({ dir, log: (l) => console.log(`[workflow ${fila.slug}] ${l}`) }, nuevo, { ids: [assetId], signal: req.signal })).p;
    const n = await guardarProyecto(pedido.proyecto, nuevo, `Resultado de «${c.titulo}» en ${pedido.escena}`);
    await registrarAssetsEnDb(pedido.proyecto, nuevo);
    return json({ version: n, asset: assetId }, 201);
  });
}
