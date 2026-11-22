import { eliminarProyecto } from "@/lib/eliminar-proyecto";
import { json, manejar } from "@/lib/http";
import { vistaProyecto } from "@/lib/vista";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const v = await vistaProyecto(id);
  if (!v) return json({ error: "No existe" }, 404);
  return json(v);
}

/** Elimina el proyecto: su carpeta va a la papelera y se borra de la lista (eliminar-proyecto.ts). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return manejar(async () => json(await eliminarProyecto((await ctx.params).id)));
}
