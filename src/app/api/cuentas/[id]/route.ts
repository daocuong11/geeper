import { z } from "zod";
import { db } from "@/lib/db";
import { json, manejar } from "@/lib/http";
import { obtenerPlantilla } from "@/lib/plantillas";
import { cuentaPublica, desconectar } from "@/lib/redes/cuentas";

const Cambios = z.object({
  alias: z.string().trim().max(80).nullable().optional(),
  plantilla: z.string().trim().max(80).nullable().optional(),
});

/** Renombrar (alias) o fijar la plantilla sugerida. Texto vacío = quitar. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    const { id } = await ctx.params;
    const c = Cambios.parse(await req.json());
    const data: { alias?: string | null; plantilla?: string | null } = {};
    if (c.alias !== undefined) data.alias = c.alias || null;
    if (c.plantilla !== undefined) {
      data.plantilla = c.plantilla || null;
      if (data.plantilla) await obtenerPlantilla(data.plantilla);
    }
    const fila = await db.cuenta.update({ where: { id }, data });
    return json({ cuenta: cuentaPublica(fila) });
  });
}

/** Revoca en la red (si se puede), borra los tokens y deja la cuenta «desconectada» con su historial. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    const { id } = await ctx.params;
    await desconectar(id);
    return json({ ok: true });
  });
}
