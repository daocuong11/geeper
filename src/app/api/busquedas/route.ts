import { sugerenciasYoutube } from "@/lib/busquedas";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Sugerencias del autocompletado de YouTube. Si falla, lista vacía y el motivo: la UI sólo las oculta. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    return json({ sugerencias: await sugerenciasYoutube(q) });
  } catch (e) {
    return json({ sugerencias: [], motivo: e instanceof Error ? e.message : String(e) });
  }
}
