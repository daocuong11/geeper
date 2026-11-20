import { z } from "zod";
import { db } from "@/lib/db";
import { json, manejar } from "@/lib/http";
import { Brief, DatosCampana, datosVacios } from "@/lib/anuncios/esquema";
import { NOMBRE_EJEMPLO, datosEjemplo } from "@/lib/anuncios/ejemplo";
import { siguientePaso } from "@/lib/anuncios/siguiente";
import { revisionDe } from "@/lib/anuncios/servicio";

export const dynamic = "force-dynamic";

export async function GET() {
  const filas = await db.campana.findMany({ orderBy: [{ actualizado: "desc" }] });
  const campanas = await Promise.all(
    filas.map(async (f) => {
      const d = DatosCampana.safeParse(f.datos);
      const datos = d.success ? d.data : datosVacios();
      const r = await revisionDe(datos);
      return {
        id: f.id, nombre: f.nombre, estado: f.estado, actualizado: f.actualizado,
        marca: datos.brief.marca, objetivo: datos.brief.objetivo, ubicaciones: datos.brief.ubicaciones,
        conceptos: datos.conceptos.length, conVideo: datos.conceptos.filter((c) => c.proyectoId).length,
        resumen: r.resumen, invalida: !d.success, siguiente: siguientePaso(datos, r, f.estado),
      };
    }),
  );
  return json({ campanas });
}

const Pedido = z.union([
  z.object({ ejemplo: z.literal(true) }),
  z.object({
    nombre: z.string().trim().min(1, "Ponle nombre a la campaña").max(120),
    duplicarDe: z.string().optional(),
    /** Lo que contestó el asistente de creación. */
    brief: Brief.partial().optional(),
  }),
]);

export async function POST(req: Request) {
  return manejar(async () => {
    const d = Pedido.parse(await req.json());
    if ("ejemplo" in d) {
      // Un solo ejemplo: si ya existe, se abre ése en vez de crear otro.
      const ya = await db.campana.findFirst({ where: { nombre: NOMBRE_EJEMPLO } });
      if (ya) return json({ campana: { id: ya.id } });
      const c = await db.campana.create({ data: { nombre: NOMBRE_EJEMPLO, estado: "activa", datos: datosEjemplo() as object } });
      return json({ campana: { id: c.id } }, 201);
    }
    let datos = datosVacios();
    if (d.brief) datos = DatosCampana.parse({ ...datos, brief: { ...datos.brief, ...d.brief } });
    if (d.duplicarDe) {
      const origen = await db.campana.findUniqueOrThrow({ where: { id: d.duplicarDe } });
      datos = DatosCampana.parse(origen.datos);
      // La copia no hereda videos ni revisiones manuales: son de la campaña original.
      datos.conceptos = datos.conceptos.map((c) => ({ ...c, proyectoId: null }));
      datos.manuales = {};
    }
    const c = await db.campana.create({ data: { nombre: d.nombre, datos: datos as object } });
    return json({ campana: { id: c.id } }, 201);
  });
}
