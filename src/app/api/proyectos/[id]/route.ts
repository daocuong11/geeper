import { json } from "@/lib/http";
import { vistaProyecto } from "@/lib/vista";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const v = await vistaProyecto(id);
  if (!v) return json({ error: "No existe" }, 404);
  return json(v);
}
