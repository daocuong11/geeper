import { json, manejar } from "@/lib/http";
import { estadoEstudio, prepararEstudio, revisarEstudio } from "@/lib/estudio";

export const dynamic = "force-dynamic";

/** Cómo está el estudio de este equipo. `?revisar=1` vuelve a comprobar todo (sin instalar nada). */
export async function GET(req: Request) {
  return manejar(async () => {
    const e = estadoEstudio();
    const revisar = new URL(req.url).searchParams.has("revisar") || (!e.revisado && !e.corriendo);
    return json(e.disponible && revisar ? await revisarEstudio() : e);
  });
}

/** Instala lo que falte. Vuelve enseguida; el avance se lee con GET. */
export async function POST() {
  return manejar(async () => json(prepararEstudio(), 202));
}
