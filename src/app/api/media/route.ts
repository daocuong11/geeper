import { APPS_CRAFT, instalacionWeb, paginaRelease, versionesWeb, versionWeb } from "@/lib/craft-web";
import { json, manejar } from "@/lib/http";
import { leerCache } from "@/lib/novedades";

export const dynamic = "force-dynamic";

/** Las apps Craft de Media: qué son, si están instaladas, si hay una versión nueva y cómo va su instalación. */
export async function GET() {
  return manejar(async () => {
    const nov = new Map((await leerCache())?.novedades.map((n) => [n.id, n]) ?? []);
    return json(
      await Promise.all(
        APPS_CRAFT.map(async (a) => ({
          ...a,
          release: paginaRelease(a),
          instalada: a.soloEscritorio ? null : await versionWeb(a.app),
          versiones: a.soloEscritorio ? [] : await versionesWeb(a.app),
          ultima: nov.get(a.app)?.nuevas[0] ?? null,
          instalacion: a.soloEscritorio ? null : instalacionWeb(a),
        })),
      ),
    );
  });
}
