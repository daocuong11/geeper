import { json, manejar } from "@/lib/http";
import { prepararVistaPrevia } from "@/lib/vista-previa";

export const dynamic = "force-dynamic";

/** Compila (si hace falta) la versión actual para verla en vivo con <hyperframes-player>. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    const { id } = await ctx.params;
    return json(await prepararVistaPrevia(id));
  });
}
