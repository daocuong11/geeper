import { leerProyecto } from "@/lib/almacen";
import { db } from "@/lib/db";
import { manejar } from "@/lib/http";
import { aOtio } from "@/lib/otio";
import { dirProyecto } from "@/lib/rutas";

export const dynamic = "force-dynamic";

/** Descarga el proyecto como OpenTimelineIO (.otio) para terminarlo en FilmCraft, Resolve o Premiere. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    const { id } = await ctx.params;
    const fila = await db.proyecto.findUniqueOrThrow({ where: { id } });
    const p = await leerProyecto(fila.slug);
    if (!p) throw new Error("El proyecto todavía no tiene geeper.json");
    return new Response(JSON.stringify(aOtio(p, dirProyecto(fila.slug)), null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${fila.slug}.otio"`,
      },
    });
  });
}
