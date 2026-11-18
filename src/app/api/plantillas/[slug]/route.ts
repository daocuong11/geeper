import { db } from "@/lib/db";
import { json, manejar } from "@/lib/http";
import { DatosPlantilla } from "@/lib/plantillas";

/** Edita los datos de una plantilla (validados con su esquema). */
export async function PUT(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return manejar(async () => {
    const { slug } = await ctx.params;
    const datos = DatosPlantilla.parse(await req.json());
    const p = await db.plantilla.update({ where: { slug }, data: { datos } });
    return json({ plantilla: p });
  });
}
