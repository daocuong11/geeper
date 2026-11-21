import { z } from "zod";
import { guardarAvatar, leerPropuesta, vistaAvatar, VozAvatar } from "@/lib/avatares";
import { encolar } from "@/lib/cola";
import { db } from "@/lib/db";
import { json, manejar } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Avance de una propuesta y sus tomas (a medida que salen). */
export async function GET(req: Request) {
  return manejar(async () => {
    const u = new URL(req.url);
    const propuesta = u.searchParams.get("propuesta") ?? "";
    const trabajo = u.searchParams.get("trabajo") ?? "";
    const t = await db.trabajo.findUnique({ where: { id: trabajo } });
    if (!t || t.tipo !== "avatar.proponer" || (t.payload as { propuesta?: string }).propuesta !== propuesta) throw new Error("No existe esa propuesta de avatar");
    const p = await leerPropuesta(propuesta);
    return json({
      estado: t.estado,
      etapa: t.etapa,
      progreso: t.progreso,
      error: t.error,
      conFoto: !!p?.foto,
      tomas: (p?.tomas ?? []).map((r, i) => ({ numero: i + 1, url: `/api/archivos/${r}` })),
    });
  });
}

const Accion = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("guardar"), propuesta: z.string().regex(/^[a-z0-9]+$/), toma: z.number().int().min(1).max(40), nombre: z.string().trim().min(1, "Ponle un nombre").max(60), voz: VozAvatar.optional() }),
  z.object({ accion: z.literal("otras"), propuesta: z.string().regex(/^[a-z0-9]+$/) }),
]);

/** «guardar»: la toma elegida pasa a la biblioteca. «otras»: más tomas con lo mismo pedido. */
export async function POST(req: Request) {
  return manejar(async () => {
    const d = Accion.parse(await req.json());
    if (d.accion === "guardar") return json({ avatar: vistaAvatar(await guardarAvatar(d.propuesta, d.toma, d.nombre, d.voz)) }, 201);
    if (!(await leerPropuesta(d.propuesta))) throw new Error("Esa propuesta ya no existe: vuelve a crear el avatar.");
    const t = await encolar(null, "avatar.proponer", { propuesta: d.propuesta });
    return json({ propuesta: d.propuesta, trabajo: t.id }, 201);
  });
}
