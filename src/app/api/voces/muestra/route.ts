import { json, manejar } from "@/lib/http";
import { muestraKokoro, relativaADatos } from "@/lib/voces";

export const dynamic = "force-dynamic";

/** Muestra de una voz de Kokoro (se genera la primera vez, ~5 s en CPU). */
export async function GET(req: Request) {
  return manejar(async () => {
    const voz = new URL(req.url).searchParams.get("kokoro") ?? "";
    return json({ ruta: relativaADatos(await muestraKokoro(voz)) });
  });
}
