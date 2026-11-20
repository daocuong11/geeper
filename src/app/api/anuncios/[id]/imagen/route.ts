import path from "node:path";
import { db } from "@/lib/db";
import { json, manejar } from "@/lib/http";
import { guardarImagenSubida } from "@/lib/imagen-subida";
import { dirDatos } from "@/lib/rutas";
import { dirCampana } from "@/lib/anuncios/rutas-campana";

export const dynamic = "force-dynamic";

/** Imagen para una fila de la tabla de variantes: se guarda en ~/geeper-data/anuncios/<campaña>/. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    const { id } = await ctx.params;
    await db.campana.findUniqueOrThrow({ where: { id } });
    const form = await req.formData();
    const { abs } = await guardarImagenSubida(form.get("archivo"), dirCampana(id), "img");
    return json({ ruta: path.relative(dirDatos(), abs) }, 201);
  });
}
