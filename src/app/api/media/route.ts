import { APPS_CRAFT, instaladorWeb, paginaRelease, versionWeb } from "@/lib/craft-web";
import { json, manejar } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Las apps Craft de Media: qué son, si están instaladas y cómo va su instalación. */
export async function GET() {
  return manejar(async () =>
    json(
      await Promise.all(
        APPS_CRAFT.map(async (a) => ({
          ...a,
          release: paginaRelease(a),
          instalada: a.soloEscritorio ? null : await versionWeb(a.app),
          instalacion: a.soloEscritorio ? null : instaladorWeb(a).estado(),
        })),
      ),
    ),
  );
}
