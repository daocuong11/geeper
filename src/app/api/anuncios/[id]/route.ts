import { db } from "@/lib/db";
import { json, manejar } from "@/lib/http";
import { guardarDatos, leerCampana, revisionDe } from "@/lib/anuncios/servicio";
import { siguientePaso } from "@/lib/anuncios/siguiente";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function vista(id: string) {
  const { fila, datos } = await leerCampana(id);
  const revision = await revisionDe(datos);
  return { campana: { id: fila.id, nombre: fila.nombre, estado: fila.estado, actualizado: fila.actualizado }, datos, revision, siguiente: siguientePaso(datos, revision, fila.estado) };
}

export async function GET(_req: Request, ctx: Ctx) {
  return manejar(async () => json(await vista((await ctx.params).id)));
}

/** Guarda nombre, estado o datos (validados) y devuelve la revisión recalculada. */
export async function PUT(req: Request, ctx: Ctx) {
  return manejar(async () => {
    const { id } = await ctx.params;
    await guardarDatos(id, (await req.json()) as { nombre?: string; estado?: string; datos?: unknown });
    return json(await vista(id));
  });
}

/** Borra la campaña. Los proyectos (videos) vinculados no se tocan. */
export async function DELETE(_req: Request, ctx: Ctx) {
  return manejar(async () => {
    await db.campana.delete({ where: { id: (await ctx.params).id } });
    return json({ ok: true });
  });
}
