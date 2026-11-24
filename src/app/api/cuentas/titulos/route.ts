import { db } from "@/lib/db";
import { json, manejar } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Por cuenta, los títulos ya publicados (o en camino) en cualquier proyecto: para avisar de duplicados. */
export async function GET() {
  return manejar(async () => {
    const filas = await db.publicacion.findMany({
      where: { estado: { notIn: ["cancelada", "fallida"] } },
      orderBy: { creado: "desc" },
      take: 2000,
      select: { cuentaId: true, titulo: true },
    });
    const porCuenta: Record<string, string[]> = {};
    for (const f of filas) (porCuenta[f.cuentaId] ??= []).push(f.titulo);
    return json({ porCuenta });
  });
}
