import { json, manejar } from "@/lib/http";
import { protegerPrivados, revisarPrivados } from "@/lib/redes/privados";

export const dynamic = "force-dynamic";

/** Estado de los archivos secretos (nunca su contenido). */
export async function GET() {
  return manejar(async () => json({ archivos: revisarPrivados() }));
}

/**
 * Los deja con permisos 600 (sólo si son archivos normales del usuario). Exige JSON: un formulario
 * de otra página no puede mandarlo sin un preflight de CORS, que Geeper no acepta.
 */
export async function POST(req: Request) {
  return manejar(async () => {
    if (!req.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Se espera JSON" }, 415);
    return json({ archivos: protegerPrivados() });
  });
}
