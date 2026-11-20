import { z } from "zod";
import { json, manejar } from "@/lib/http";
import { leerMarca } from "@/lib/anuncios/marca";

export const dynamic = "force-dynamic";

/** Lee un sitio público y devuelve lo observado y lo inferido de su marca (no guarda nada). */
export async function POST(req: Request) {
  return manejar(async () => {
    const { url } = z.object({ url: z.string().url().max(500) }).parse(await req.json());
    return json({ perfil: await leerMarca(url) });
  });
}
