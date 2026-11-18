import { encolar } from "@/lib/cola";
import { db } from "@/lib/db";
import { json, manejar } from "@/lib/http";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    const { id } = await ctx.params;
    const p = await db.proyecto.findUniqueOrThrow({ where: { id } });
    if (p.versionActual < 1) throw new Error("El proyecto todavía no tiene geeper.json");
    const activo = await db.trabajo.findFirst({ where: { proyectoId: id, tipo: "render.entregar", estado: { in: ["pendiente", "corriendo"] } } });
    if (activo) throw new Error("Ya hay un render en cola para este proyecto");
    const t = await encolar(id, "render.entregar", { version: p.versionActual });
    return json({ trabajo: t }, 201);
  });
}
