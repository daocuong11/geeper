import { z } from "zod";
import { encolar } from "@/lib/cola";
import { db } from "@/lib/db";
import { json, manejar } from "@/lib/http";

/** Regenera la voz (Kokoro, CPU) de una escena o del guion completo, realinea y vuelve a renderizar. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    const { id } = await ctx.params;
    const { escena } = z.object({ escena: z.string().nullable() }).parse(await req.json());
    const p = await db.proyecto.findUniqueOrThrow({ where: { id } });
    if (p.versionActual < 1) throw new Error("El proyecto todavía no tiene geeper.json");
    const activo = await db.trabajo.findFirst({ where: { proyectoId: id, tipo: "voz.regenerar", estado: { in: ["pendiente", "corriendo"] } } });
    if (activo) throw new Error("Ya hay una voz regenerándose en este proyecto");
    const t = await encolar(id, "voz.regenerar", { escena, cadena: ["render.entregar"] });
    return json({ trabajo: t }, 201);
  });
}
