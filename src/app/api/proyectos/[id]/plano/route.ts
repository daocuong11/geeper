import { z } from "zod";
import { encolar } from "@/lib/cola";
import { db } from "@/lib/db";
import { json, manejar } from "@/lib/http";
import { revisarWan2gp } from "@/lib/instalar-wan2gp";
import { planearPlano, type OpcionesPlano } from "@/lib/plano";
import { APERTURAS, CAMARAS, LENTES, MOVIMIENTOS } from "@/lib/prompt-camara";
import { versionDeProyecto } from "@/lib/render";
import { estadoModelos, instalacionWan2gp, MODELO_POR_DEFECTO, MODELOS_PLANO } from "@/lib/wan2gp";

export const dynamic = "force-dynamic";

const claves = <T extends object>(t: T) => Object.keys(t) as [string, ...string[]];

const Opciones = z.object({
  modelo: z.enum(MODELOS_PLANO.map((m) => m.id) as [string, ...string[]]).optional(),
  prompt: z.string().max(1500).optional(),
  segundos: z.number().min(0.5).max(10).optional(),
  semilla: z.number().int().min(0).max(2147483647).optional(),
  pasos: z.number().int().min(1).max(80).optional(),
  negativo: z.string().max(500).optional(),
  sinImagen: z.boolean().optional(),
  camara: z.object({
    camara: z.enum(claves(CAMARAS)).optional(),
    lente: z.enum(claves(LENTES)).optional(),
    focal: z.union([z.literal(8), z.literal(14), z.literal(24), z.literal(35), z.literal(50), z.literal(85)]).optional(),
    apertura: z.enum(claves(APERTURAS)).optional(),
    movimiento: z.enum(claves(MOVIMIENTOS)).optional(),
  }).optional(),
}).strict();

const activos = (id: string) =>
  db.trabajo.findMany({ where: { proyectoId: id, tipo: "plano.generar", estado: { in: ["pendiente", "corriendo"] } }, select: { id: true, estado: true, etapa: true, progreso: true, payload: true, iniciado: true } });

/**
 * Lo que necesita «Animar esta escena»: si Wan2GP está instalado, los modelos, qué se va a pedir para esta
 * escena (descripción, segundos, avisos) y si ya hay una animación en curso. No usa la GPU.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    const { id } = await ctx.params;
    const u = new URL(req.url);
    const escena = u.searchParams.get("escena") ?? "";
    const opciones = Opciones.parse(JSON.parse(u.searchParams.get("opciones") ?? "{}")) as OpcionesPlano;
    const w = revisarWan2gp();
    const estado = w.falta ? null : estadoModelos(instalacionWan2gp());
    const { p } = await versionDeProyecto(id);
    let plan = null;
    let error = null;
    try {
      const x = planearPlano(p, escena, opciones);
      plan = { ...x, modelo: x.modelo.id };
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    return json({
      wan2gp: { listo: !w.falta, falta: w.falta, instalando: w.corriendo },
      modeloPorDefecto: MODELO_POR_DEFECTO,
      modelos: MODELOS_PLANO.map((m) => ({ id: m.id, nombre: m.nombre, nota: m.nota, descripcion: m.descripcion, simple: m.simple, maxSegundos: m.maxSegundos, necesitaImagen: m.necesitaImagen, licencia: m.licencia, estado: estado?.[m.id] ?? null })),
      plan,
      error,
      trabajos: (await activos(id)).map((t) => ({ ...t, escena: (t.payload as { escena?: string }).escena ?? null, payload: undefined })),
    });
  });
}

/** Encola la animación de una escena (trabajo `plano.generar`, usa toda la GPU). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    const { id } = await ctx.params;
    const d = z.object({ escena: z.string().min(1).max(64), opciones: Opciones.default({}) }).parse(await req.json());
    const fila = await db.proyecto.findUniqueOrThrow({ where: { id } });
    if (fila.versionActual < 1) throw new Error("El proyecto todavía no tiene geeper.json");
    const w = revisarWan2gp();
    if (w.falta) throw new Error("Falta instalar Wan2GP: ve a Sistema y pulsa «Instalar» en «Wan2GP».");
    const { p } = await versionDeProyecto(id);
    const plan = planearPlano(p, d.escena, d.opciones as OpcionesPlano); // valida antes de encolar
    if ((await activos(id)).some((t) => (t.payload as { escena?: string }).escena === plan.escena)) {
      throw new Error(`La escena ${plan.numero} ya se está animando: mira el avance en Trabajos.`);
    }
    const t = await encolar(id, "plano.generar", { escena: plan.escena, opciones: d.opciones, cadena: [] });
    return json({ trabajo: t, plan: { ...plan, modelo: plan.modelo.id } }, 201);
  });
}
