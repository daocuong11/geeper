import { z } from "zod";
import { cancelar, relanzar } from "@/lib/cola";
import { json, manejar } from "@/lib/http";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    const { id } = await ctx.params;
    const { accion } = z.object({ accion: z.enum(["relanzar", "cancelar"]) }).parse(await req.json());
    if (accion === "relanzar") await relanzar(id);
    else await cancelar(id);
    return json({ ok: true });
  });
}
