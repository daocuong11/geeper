import { manejar } from "@/lib/http";
import { aCsv, aMarkdown } from "@/lib/anuncios/exportar";
import { leerCampana, revisionDe } from "@/lib/anuncios/servicio";
import { slugDe } from "@/lib/servicios";

export const dynamic = "force-dynamic";

/** ?formato=md (copy deck) | csv (checklist para quien lanza la campaña). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    const { fila, datos } = await leerCampana((await ctx.params).id);
    const r = await revisionDe(datos);
    const csv = new URL(req.url).searchParams.get("formato") === "csv";
    const cuerpo = csv ? aCsv(r) : aMarkdown(fila.nombre, fila.estado, datos, r);
    const nombre = `${slugDe(fila.nombre).replace(/-[0-9a-f]{6}$/, "")}.${csv ? "csv" : "md"}`;
    return new Response(cuerpo, {
      headers: {
        "content-type": csv ? "text/csv; charset=utf-8" : "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="${nombre}"`,
      },
    });
  });
}
