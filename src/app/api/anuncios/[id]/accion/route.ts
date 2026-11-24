import { z } from "zod";
import { Formato } from "@/lib/esquema";
import { json, manejar } from "@/lib/http";
import { generarVideo, prepararProyecto, proponerIdeas, varianteDeGancho, variantesDeTabla, vincular } from "@/lib/anuncios/servicio";

export const dynamic = "force-dynamic";

const Accion = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("generar"), concepto: z.string().min(1) }),
  z.object({ tipo: z.literal("vincular"), concepto: z.string().min(1), proyecto: z.string().min(1).nullable() }),
  z.object({ tipo: z.literal("preparar"), concepto: z.string().min(1), formato: Formato.optional() }),
  z.object({ tipo: z.literal("ideas") }),
  z.object({ tipo: z.literal("variante"), concepto: z.string().min(1), gancho: z.string().min(3).max(300) }),
  z.object({ tipo: z.literal("variantesTabla"), concepto: z.string().min(1) }),
]);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    const { id } = await ctx.params;
    const a = Accion.parse(await req.json());
    if (a.tipo === "generar") {
      const p = await generarVideo(id, a.concepto);
      return json({ proyecto: { id: p.id } }, 201);
    }
    if (a.tipo === "vincular") {
      await vincular(id, a.concepto, a.proyecto);
      return json({ ok: true });
    }
    if (a.tipo === "ideas") return json(await proponerIdeas(id), 201);
    if (a.tipo === "variante") return json(await varianteDeGancho(id, a.concepto, a.gancho), 201);
    if (a.tipo === "variantesTabla") return json(await variantesDeTabla(id, a.concepto), 201);
    return json(await prepararProyecto(id, a.concepto, a.formato));
  });
}
