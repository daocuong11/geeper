import { z } from "zod";
import { EstiloGeneracion } from "@/lib/estilos-generacion";
import { db } from "@/lib/db";
import { Formato } from "@/lib/esquema";
import { json, manejar } from "@/lib/http";
import { crearLote, crearProyecto, importarTareaMpt } from "@/lib/servicios";

export const dynamic = "force-dynamic";

export async function GET() {
  const proyectos = await db.proyecto.findMany({
    orderBy: [{ creado: "desc" }],
    include: {
      renders: { orderBy: { creado: "desc" }, take: 1 },
      trabajos: { orderBy: { creado: "desc" }, take: 1 },
      lote: { select: { nombre: true } },
    },
  });
  return json({ proyectos });
}

const Pedido = z.object({
  temas: z.string().min(1, "Escribe al menos un tema"),
  formato: Formato,
  plantilla: z.string().min(1),
  nombreLote: z.string().optional(),
  mptTaskId: z.string().optional(),
  rehacerVoz: z.boolean().optional(),
  /** Avatar de la biblioteca para que Geeper lo ponga en las escenas que más ganan con él. */
  avatar: z.string().regex(/^[a-z0-9-]+$/).optional(),
  /** Cuánto se trabaja cada escena (estilos-generacion.ts); sin él, «Rápido». */
  estilo: EstiloGeneracion.optional(),
});

export async function POST(req: Request) {
  return manejar(async () => {
    const d = Pedido.parse(await req.json());
    const temas = d.temas.split("\n").map((t) => t.trim()).filter(Boolean);
    if (d.mptTaskId?.trim()) {
      const p = await importarTareaMpt(d.mptTaskId.trim(), { tema: temas[0]!, formato: d.formato, plantilla: d.plantilla }, d.rehacerVoz);
      return json({ proyectos: [p] }, 201);
    }
    if (temas.length === 1) return json({ proyectos: [await crearProyecto({ tema: temas[0]!, formato: d.formato, plantilla: d.plantilla, avatar: d.avatar, estilo: d.estilo })] }, 201);
    const r = await crearLote(temas, d.formato, d.plantilla, d.nombreLote, d.avatar, d.estilo);
    return json({ lote: r.lote, proyectos: r.proyectos }, 201);
  });
}
