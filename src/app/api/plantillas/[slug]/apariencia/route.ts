import { z } from "zod";
import { guardarApariencia, muestrasDe } from "@/lib/apariencia";
import { json, manejar } from "@/lib/http";
import { IdLook } from "@/lib/looks";
import { versionPhotocraft } from "@/lib/photocraft";
import { obtenerPlantilla } from "@/lib/plantillas";

export const dynamic = "force-dynamic";

/** Color y portada de la plantilla, con una muestra de cada look y de cada estilo (en caché). */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return manejar(async () => {
    const { slug } = await ctx.params;
    const { datos } = await obtenerPlantilla(slug);
    const herramienta = !!(await versionPhotocraft());
    const pedida = Number(new URL(req.url).searchParams.get("intensidad"));
    const intensidad = Number.isFinite(pedida) && pedida > 0 && pedida <= 1 ? pedida : datos.color.intensidad;
    return json({
      color: datos.color,
      estilo: datos.portada.estilo,
      propios: datos.portada.plantillas,
      herramienta,
      muestras: herramienta ? await muestrasDe(slug, intensidad) : null,
    });
  });
}

const Cambio = z.object({
  color: z.object({ look: IdLook, intensidad: z.number().min(0).max(1), mejora: z.boolean() }).partial().optional(),
  estilo: z.enum(["abajo", "centro", "banda"]).optional(),
});

/** Guarda sólo el color y el estilo de portada (no toca lo demás de la plantilla). */
export async function PATCH(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return manejar(async () => {
    const { slug } = await ctx.params;
    const datos = await guardarApariencia(slug, Cambio.parse(await req.json()));
    return json({ color: datos.color, estilo: datos.portada.estilo });
  });
}
