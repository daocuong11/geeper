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
  // La sesión de subida de una publicación permite subir a la cuenta: no sale por la API.
  for (const t of trabajos) {
    if (t.payload && typeof t.payload === "object" && "sesion" in t.payload) t.payload = { ...(t.payload as object), sesion: "[oculto]" };
  }
  return json({ trabajos, workerLatido: latido?.valor ?? null, workerVivo: !!latido && ahora - new Date(latido.valor).getTime() < 60_000, ahora });
}
