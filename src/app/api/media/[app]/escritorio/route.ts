import { z } from "zod";
import { abrirEscritorio, appEscritorio, instalarEscritorio } from "@/lib/craft-escritorio";
import { json, manejar } from "@/lib/http";

export const dynamic = "force-dynamic";

const Pedido = z.object({ accion: z.enum(["instalar", "abrir"]) }).strict();

/** Instala (vuelve enseguida; el avance sale en GET /api/media) o abre el programa de escritorio de una app Craft. */
export async function POST(req: Request, ctx: { params: Promise<{ app: string }> }) {
  return manejar(async () => {
    const a = appEscritorio((await ctx.params).app);
    if (!a) return json({ error: "Esa app no es de escritorio" }, 404);
    const texto = await req.text();
    const { accion } = Pedido.parse(texto ? JSON.parse(texto) : {});
    if (accion === "abrir") {
      abrirEscritorio(a);
      return json({ ok: true });
    }
    return json(instalarEscritorio(a), 202);
  });
}
