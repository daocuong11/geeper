import { z } from "zod";
import { TIPOS } from "@/lib/cola";
import { db } from "@/lib/db";
import { json, manejar } from "@/lib/http";
import { admite, obtenerRed } from "@/lib/redes/index";
import type { Privacidad } from "@/lib/redes/tipos";

const Destino = z.object({
  cuentaId: z.string().min(1),
  titulo: z.string().trim().min(1).max(100),
  descripcion: z.string().max(5000),
  privacidad: z.enum(["publico", "no_listado", "privado", "borrador"]),
  programada: z.iso.datetime({ offset: true }).nullable().optional(),
});

const Pedido = z.object({
  renderId: z.string().min(1),
  destinos: z.array(Destino).min(1).max(20),
});

const ACTIVOS = ["pendiente", "corriendo"];

/**
 * Publica un render aprobado en una o varias cuentas: una `Publicacion` y un trabajo
 * `publicar.subir` por cuenta, todo en una transacción (o se encolan todas o ninguna).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    const { id } = await ctx.params;
    const { renderId, destinos } = Pedido.parse(await req.json());
    if (new Set(destinos.map((d) => d.cuentaId)).size !== destinos.length) throw new Error("Hay una cuenta repetida en los destinos");

    const render = await db.render.findFirst({ where: { id: renderId, proyectoId: id } });
    if (!render) throw new Error("Ese render no es de este proyecto");
    if (render.estado !== "aprobado") throw new Error("Sólo se publica un render aprobado por el QC");

    const cuentas = await db.cuenta.findMany({ where: { id: { in: destinos.map((d) => d.cuentaId) } } });
    for (const d of destinos) {
      const c = cuentas.find((x) => x.id === d.cuentaId);
      if (!c) throw new Error(`No existe la cuenta ${d.cuentaId}`);
      const nombre = c.alias ?? c.usuario;
      if (c.estado !== "conectada") throw new Error(`La cuenta ${nombre} está «${c.estado}»: reconéctala en Cuentas`);
      const red = obtenerRed(c.red);
      if (!admite(red, render.perfil)) throw new Error(`${red.nombre} no admite el formato ${render.perfil} (${nombre})`);
      if (!red.privacidades.includes(d.privacidad as Privacidad)) throw new Error(`${red.nombre} no admite la privacidad «${d.privacidad}» (${nombre})`);
      if (d.programada) {
        if (!red.programar) throw new Error(`${red.nombre} no permite programar la publicación (${nombre})`);
        if (red.id === "youtube" && d.privacidad !== "privado") throw new Error(`YouTube sólo programa videos privados: elige «privado» para ${nombre}`);
        if (new Date(d.programada).getTime() <= Date.now() + 60_000) throw new Error(`La hora programada para ${nombre} ya pasó o es demasiado cercana`);
      }
    }

    const t = TIPOS["publicar.subir"];
    const publicaciones = await db.$transaction(async (tx) => {
      const out = [];
      for (const d of destinos) {
        const previa = await tx.publicacion.findUnique({ where: { renderId_cuentaId: { renderId, cuentaId: d.cuentaId } } });
        if (previa) {
          const trabajo = previa.trabajoId ? await tx.trabajo.findUnique({ where: { id: previa.trabajoId }, select: { estado: true, payload: true } }) : null;
          const activo = !!trabajo && ACTIVOS.includes(trabajo.estado);
          // Si ya se llamó a publicar (Instagram) o hay algo publicado, sólo se retoma con «Reintentar»:
          // empezar de cero podría duplicar el video si la publicación llegó pero no se guardó.
          const pl = (trabajo?.payload ?? {}) as Record<string, unknown>;
          const quizasPublicado = !!previa.idExterno || !!pl.publicando || !!pl.publicado;
          const libre = previa.estado === "cancelada" ? !quizasPublicado : previa.estado === "fallida" && !quizasPublicado && !activo;
          if (!libre) throw new Error(`Ya existe una publicación de este render en esa cuenta (estado ${previa.estado})`);
          await tx.publicacion.delete({ where: { id: previa.id } });
        }
        const pub = await tx.publicacion.create({
          data: {
            proyectoId: id,
            renderId,
            cuentaId: d.cuentaId,
            titulo: d.titulo,
            descripcion: d.descripcion,
            privacidad: d.privacidad,
            programada: d.programada ? new Date(d.programada) : null,
          },
        });
        // Igual que encolar() de la cola, pero dentro de la transacción.
        const trabajo = await tx.trabajo.create({
          data: { proyectoId: id, tipo: "publicar.subir", motor: t.motor, usaGpu: t.usaGpu, payload: { publicacionId: pub.id }, maxIntentos: 1 },
        });
        out.push(await tx.publicacion.update({ where: { id: pub.id }, data: { trabajoId: trabajo.id } }));
      }
      return out;
    });
    return json({ publicaciones }, 201);
  });
}
