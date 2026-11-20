import { z } from "zod";
import { appCraft, instalacionWeb, instaladorWeb, usarVersionWeb, versionWeb } from "@/lib/craft-web";
import { json, manejar } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Estado de la versión web de una app Craft. */
export async function GET(_req: Request, ctx: { params: Promise<{ app: string }> }) {
  return manejar(async () => {
    const a = appCraft((await ctx.params).app);
    if (!a) return json({ error: "Esa app no está en Media" }, 404);
    return json({ ...a, instalada: await versionWeb(a.app), instalacion: instalacionWeb(a) });
  });
}

const Pedido = z.object({
  /** Instalar esta versión (release oficial, SHA256 verificado). Sin ella, la del catálogo. */
  version: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
  /** Volver a una versión ya instalada, sin descargar. */
  usar: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
}).strict();

/** Instala (o actualiza) la versión web, o vuelve a una anterior. Instalar vuelve enseguida; el avance se lee con GET. */
export async function POST(req: Request, ctx: { params: Promise<{ app: string }> }) {
  return manejar(async () => {
    const a = appCraft((await ctx.params).app);
    if (!a) return json({ error: "Esa app no está en Media" }, 404);
    const texto = await req.text();
    const cuerpo = Pedido.parse(texto ? JSON.parse(texto) : {});
    if (cuerpo.usar) {
      await usarVersionWeb(a.app, cuerpo.usar);
      return json({ instalada: await versionWeb(a.app) });
    }
    return json(instaladorWeb(a, cuerpo.version).iniciar(), 202);
  });
}
