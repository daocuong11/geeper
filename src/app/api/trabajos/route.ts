import { db } from "@/lib/db";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const proyectoId = u.searchParams.get("proyecto") ?? undefined;
  const trabajos = await db.trabajo.findMany({
    where: proyectoId ? { proyectoId } : {},
    orderBy: { creado: "desc" },
    take: 200,
    include: { proyecto: { select: { nombre: true, slug: true } } },
  });
  const latido = await db.sistema.findUnique({ where: { clave: "worker.latido" } });
  const ahora = Date.now();
  return json({ trabajos, workerLatido: latido?.valor ?? null, workerVivo: !!latido && ahora - new Date(latido.valor).getTime() < 60_000, ahora });
}
