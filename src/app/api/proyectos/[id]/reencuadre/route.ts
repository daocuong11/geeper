import { z } from "zod";
import { encolar } from "@/lib/cola";
import { db } from "@/lib/db";
import { json, manejar } from "@/lib/http";

/** Reencuadra a 9:16 siguiendo la cara el video de una escena (y las que usan el mismo video). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    const { id } = await ctx.params;
    const d = z.object({ escena: z.string().min(1), layout: z.enum(["react", "cara"]) }).parse(await req.json());
    const p = await db.proyecto.findUniqueOrThrow({ where: { id } });
    if (p.versionActual < 1) throw new Error("El proyecto todavía no tiene geeper.json");
    const activo = await db.trabajo.findFirst({ where: { proyectoId: id, tipo: "visual.reencuadrar", estado: { in: ["pendiente", "corriendo"] } } });
    if (activo) throw new Error("Ya hay un reencuadre en curso en este proyecto");
    const t = await encolar(id, "visual.reencuadrar", { ...d, cadena: [] });
    return json({ trabajo: t }, 201);
  });
}
