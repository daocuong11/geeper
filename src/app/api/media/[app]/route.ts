import { appCraft, instaladorWeb, versionWeb } from "@/lib/craft-web";
import { json, manejar } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Estado de la versión web de una app Craft. */
export async function GET(_req: Request, ctx: { params: Promise<{ app: string }> }) {
  return manejar(async () => {
    const a = appCraft((await ctx.params).app);
    if (!a) return json({ error: "Esa app no está en Media" }, 404);
    return json({ ...a, instalada: await versionWeb(a.app), instalacion: instaladorWeb(a).estado() });
  });
}

/** Instala la versión web oficial (release fijada, SHA256 verificado). Vuelve enseguida; el avance se lee con GET. */
export async function POST(_req: Request, ctx: { params: Promise<{ app: string }> }) {
  return manejar(async () => {
    const a = appCraft((await ctx.params).app);
    if (!a) return json({ error: "Esa app no está en Media" }, 404);
    return json(instaladorWeb(a).iniciar(), 202);
  });
}
