import path from "node:path";
import { db } from "@/lib/db";
import { json, manejar } from "@/lib/http";
import { guardarImagenSubida } from "@/lib/imagen-subida";
import { paletaDeArchivo } from "@/lib/paleta";
import { dirDatos } from "@/lib/rutas";

export const dynamic = "force-dynamic";

/**
 * Sube el logo de una plantilla a ~/geeper-data/plantillas/<slug>/ y devuelve su ruta y sus colores.
 * No cambia la plantilla: el editor pone la ruta en `marca.logo` y la persona guarda.
 */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return manejar(async () => {
    const { slug } = await ctx.params;
    await db.plantilla.findUniqueOrThrow({ where: { slug } });
    const form = await req.formData();
    const { abs, avisos } = await guardarImagenSubida(form.get("archivo"), path.join(dirDatos(), "plantillas", slug), "logo");
    let paleta = null;
    try {
      paleta = await paletaDeArchivo(abs);
    } catch {
      paleta = null; // El logo sirve aunque no se puedan sacar colores.
    }
    return json({ logo: abs, ruta: path.relative(dirDatos(), abs), paleta, avisos }, 201);
  });
}
