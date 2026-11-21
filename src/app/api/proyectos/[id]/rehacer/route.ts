import { z } from "zod";
import { leerAvatar, listarAvatares, vistaAvatar } from "@/lib/avatares";
import { encolar } from "@/lib/cola";
import { db } from "@/lib/db";
import { json, manejar } from "@/lib/http";
import { revisarWan2gp } from "@/lib/instalar-wan2gp";
import { MAX_CAMARA, MAX_PERSONA, MOVIMIENTOS, PedidoRehacer, planearRehacer } from "@/lib/rehacer";
import { versionDeProyecto } from "@/lib/render";

export const dynamic = "force-dynamic";

const activos = (id: string) =>
  db.trabajo.findMany({ where: { proyectoId: id, tipo: "escena.rehacer", estado: { in: ["pendiente", "corriendo"] } }, select: { id: true, estado: true, etapa: true, progreso: true, payload: true } });

/** Lo que necesita «Rehacer la toma» para una escena: avatares, movimientos y qué se haría (sin GPU). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    const { id } = await ctx.params;
    const u = new URL(req.url);
    const escena = u.searchParams.get("escena") ?? "";
    const w = revisarWan2gp();
    const { p } = await versionDeProyecto(id);
    const planes: Record<string, unknown> = {};
    for (const [tipo, pedido] of [["persona", { tipo: "persona", avatar: "x" }], ["camara", { tipo: "camara", movimiento: 1 }]] as const) {
      try {
        const x = planearRehacer(p, escena, PedidoRehacer.parse(pedido));
        planes[tipo] = { ok: true, notas: x.notas, segundos: x.tramo.largo };
      } catch (e) {
        planes[tipo] = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
    return json({
      wan2gp: { listo: !w.falta, falta: w.falta },
      avatares: (await listarAvatares()).map(vistaAvatar),
      movimientos: MOVIMIENTOS,
      limites: { persona: MAX_PERSONA, camara: Math.round(MAX_CAMARA) },
      planes,
      trabajos: (await activos(id)).map((t) => ({ id: t.id, estado: t.estado, etapa: t.etapa, progreso: t.progreso, escena: (t.payload as { escena?: string }).escena ?? null })),
    });
  });
}

/** Encola «Rehacer la toma» (trabajo `escena.rehacer`, usa toda la GPU). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    const { id } = await ctx.params;
    const d = z.object({ escena: z.string().min(1).max(64), pedido: PedidoRehacer }).parse(await req.json());
    const w = revisarWan2gp();
    if (w.falta) throw new Error("Falta instalar Wan2GP: ve a Sistema y pulsa «Instalar» en «Wan2GP».");
    const { p } = await versionDeProyecto(id);
    const plan = planearRehacer(p, d.escena, d.pedido);
    if (d.pedido.tipo === "persona") await leerAvatar(d.pedido.avatar).catch(() => { throw new Error("Ese avatar ya no está en la biblioteca."); });
    if ((await activos(id)).some((t) => (t.payload as { escena?: string }).escena === plan.escena)) throw new Error(`La escena ${plan.numero} ya se está rehaciendo: mira el avance en Trabajos.`);
    const t = await encolar(id, "escena.rehacer", { escena: plan.escena, pedido: d.pedido, cadena: [] });
    return json({ trabajo: t }, 201);
  });
}
