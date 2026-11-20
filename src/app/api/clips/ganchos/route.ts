import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ResultadoMomentos } from "@/lib/buscar-momentos";
import { dirFuentes } from "@/lib/fuentes";
import { sugerirGanchos } from "@/lib/ganchos";
import { json, manejar } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Tres ideas de gancho y un título para un momento, con el modelo local (puede tardar ~1 min). */
export async function POST(req: Request) {
  return manejar(async () => {
    const d = z.object({ fuenteId: z.string().regex(/^[a-f0-9]{12}$/), momento: z.number().int().positive(), react: z.boolean().default(true) }).parse(await req.json());
    const r = JSON.parse(await fs.readFile(path.join(dirFuentes(), d.fuenteId, "candidatos.json"), "utf8")) as ResultadoMomentos;
    const c = r.candidatos.find((x) => x.n === d.momento);
    if (!c) throw new Error("Ese momento ya no existe: vuelve a analizar el video");
    return json(await sugerirGanchos({ texto: c.texto ?? "", canal: r.info.canal, idioma: r.idioma, react: d.react }));
  });
}
