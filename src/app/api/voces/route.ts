import path from "node:path";
import { z } from "zod";
import { json, manejar } from "@/lib/http";
import { KOKORO, LICENCIA_VOXCPM, dirVoces, guardarVoz, listarGuardadas, relativaADatos, vozInstalada } from "@/lib/voces";

export const dynamic = "force-dynamic";

/** Voces para elegir: las fijas de Kokoro y las diseñadas de la biblioteca, con su muestra. */
export async function GET(req: Request) {
  return manejar(async () => {
    const guardadas = (await listarGuardadas()).map((v) => ({
      id: v.id, nombre: v.nombre, descripcion: v.descripcion, licencia: v.licencia,
      muestra: relativaADatos(path.join(dirVoces(), v.id, "referencia.wav")),
    }));
    const idioma = new URL(req.url).searchParams.get("idioma") ?? "es";
    return json({ instalada: vozInstalada(), licencia: LICENCIA_VOXCPM, kokoro: KOKORO[idioma] ?? [], guardadas });
  });
}

/** Guarda una toma de una propuesta como voz de la biblioteca. */
export async function POST(req: Request) {
  return manejar(async () => {
    const d = z.object({ propuesta: z.string().regex(/^[a-z0-9]+$/), toma: z.number().int().min(1).max(9), nombre: z.string().trim().min(1).max(60) }).parse(await req.json());
    return json({ voz: await guardarVoz(d.propuesta, d.toma, d.nombre) }, 201);
  });
}
