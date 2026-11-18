import { z } from "zod";
import { cancelar, relanzar } from "@/lib/cola";
import { db } from "@/lib/db";
import { json, manejar } from "@/lib/http";

/**
 * reintentar: relanza el mismo trabajo (conserva el payload, así retoma la sesión de subida).
 * cancelar: corta el trabajo si sigue en curso y deja la publicación «cancelada».
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    const { id } = await ctx.params;
    const { accion } = z.object({ accion: z.enum(["reintentar", "cancelar"]) }).parse(await req.json());
    const pub = await db.publicacion.findUniqueOrThrow({ where: { id } });

    if (accion === "reintentar") {
      if (pub.estado !== "fallida") throw new Error(`Sólo se reintenta una publicación fallida (está «${pub.estado}»)`);
      if (!pub.trabajoId) throw new Error("La publicación no tiene trabajo asociado: publícala de nuevo");
      await relanzar(pub.trabajoId);
      const fila = await db.publicacion.update({ where: { id }, data: { estado: "pendiente", error: null } });
      return json({ publicacion: fila });
    }

    if (pub.estado === "publicada" || pub.estado === "borrador") throw new Error(`Ya está ${pub.estado === "publicada" ? "publicada" : "en borrador"} en la red: se borra desde la app de la red`);
    if (pub.estado === "cancelada") throw new Error("Ya está cancelada");
    if (pub.trabajoId) {
      const t = await db.trabajo.findUnique({ where: { id: pub.trabajoId }, select: { estado: true } });
      if (t && (t.estado === "pendiente" || t.estado === "corriendo")) await cancelar(pub.trabajoId);
    }
    // Condicionado: si el worker la cerró entretanto (publicada o borrador), no se pisa.
    const r = await db.publicacion.updateMany({ where: { id, estado: { notIn: ["publicada", "borrador"] } }, data: { estado: "cancelada", error: "Cancelado por la persona" } });
    if (r.count !== 1) throw new Error("La publicación terminó mientras se cancelaba: ya está en la red");
    return json({ publicacion: await db.publicacion.findUniqueOrThrow({ where: { id } }) });
  });
}
