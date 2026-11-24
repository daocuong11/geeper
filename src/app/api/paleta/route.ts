import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { json, manejar } from "@/lib/http";
import { guardarImagenSubida } from "@/lib/imagen-subida";
import { paletaDeArchivo } from "@/lib/paleta";

export const dynamic = "force-dynamic";

/** Colores de una imagen subida (logo, foto de producto). No guarda la imagen. */
export async function POST(req: Request) {
  return manejar(async () => {
    const form = await req.formData();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "geeper-paleta-"));
    try {
      const { abs } = await guardarImagenSubida(form.get("archivo"), dir, "imagen");
      return json(await paletaDeArchivo(abs));
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
}
