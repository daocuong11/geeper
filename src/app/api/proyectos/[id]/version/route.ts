import { z } from "zod";
import { guardarProyecto } from "@/lib/almacen";
import { json, manejar } from "@/lib/http";
import { versionDeProyecto } from "@/lib/render";

/** Vuelve a una versión anterior: la copia como versión nueva (el historial no se borra). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    const { id } = await ctx.params;
    const { numero } = z.object({ numero: z.number().int().positive() }).parse(await req.json());
    const { p } = await versionDeProyecto(id, numero);
    const n = await guardarProyecto(id, p, `Vuelta a la versión ${numero}`);
    return json({ version: n });
  });
}
