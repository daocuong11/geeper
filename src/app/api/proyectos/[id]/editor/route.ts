import { leerProyecto } from "@/lib/almacen";
import { db } from "@/lib/db";
import { manejar } from "@/lib/http";
import { paqueteEditor } from "@/lib/paquete-editor";
import { dirProyecto } from "@/lib/rutas";

export const dynamic = "force-dynamic";

/** Descarga el paquete para terminar el proyecto en FilmCraft o DaVinci Resolve (.otio + .srt + guía). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    const { id } = await ctx.params;
    const fila = await db.proyecto.findUniqueOrThrow({ where: { id } });
    const p = await leerProyecto(fila.slug);
    if (!p) throw new Error("El proyecto todavía no tiene geeper.json");
    const zip = paqueteEditor(p, fila.slug, dirProyecto(fila.slug));
    return new Response(Buffer.from(zip), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${fila.slug}-para-editor.zip"`,
      },
    });
  });
}
