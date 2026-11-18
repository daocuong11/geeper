/** Operaciones de alto nivel que usan la web y los scripts. */
import { randomBytes } from "node:crypto";
import { crearCarpetas } from "./almacen";
import { encolar, type TipoTrabajo } from "./cola";
import { db } from "./db";
import type { Formato } from "./esquema";

export function slugDe(texto: string): string {
  const base = texto
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return `${base || "proyecto"}-${randomBytes(3).toString("hex")}`;
}

export interface NuevoProyecto {
  tema: string;
  nombre?: string;
  formato: Formato;
  plantilla: string;
  loteId?: string;
  orden?: number;
}

async function crearFila(n: NuevoProyecto) {
  const plantilla = await db.plantilla.findUnique({ where: { slug: n.plantilla } });
  if (!plantilla) throw new Error(`No existe la plantilla «${n.plantilla}»`);
  const slug = slugDe(n.nombre ?? n.tema);
  await crearCarpetas(slug);
  return db.proyecto.create({
    data: {
      slug,
      nombre: (n.nombre ?? n.tema).slice(0, 120),
      tema: n.tema,
      formato: n.formato,
      plantilla: n.plantilla,
      loteId: n.loteId,
      orden: n.orden ?? 0,
      estado: "generando",
    },
  });
}

const CADENA_FABRICA: TipoTrabajo[] = ["proyecto.importar", "render.entregar"];

/** Fábrica: MPT genera → se importa a geeper.json → render con la plantilla → QC. */
export async function crearProyecto(n: NuevoProyecto) {
  const p = await crearFila(n);
  await encolar(p.id, "mpt.generar", { cadena: CADENA_FABRICA });
  return p;
}

/** Un tema por línea. Cada tema es un proyecto con su cadena; los terminados no se repiten. */
export async function crearLote(temas: string[], formato: Formato, plantilla: string, nombre?: string) {
  const limpios = temas.map((t) => t.trim()).filter(Boolean);
  if (!limpios.length) throw new Error("El lote no tiene temas");
  const lote = await db.lote.create({
    data: { nombre: nombre ?? `Lote de ${limpios.length} temas`, formato, plantilla, temas: limpios },
  });
  const proyectos = [];
  for (const [i, tema] of limpios.entries()) proyectos.push(await crearProyecto({ tema, formato, plantilla, loteId: lote.id, orden: i }));
  return { lote, proyectos };
}

/** Trae un short que MPT ya generó (sin usar la GPU): importar → render → QC. */
/**
 * Trae un short que MPT ya generó (sin usar la GPU): importar → render → QC. Con `rehacerVoz`, la voz
 * se vuelve a sintetizar con la de la plantilla (Kokoro de MPT, en CPU) antes del render: sirve para
 * shorts viejos hechos a velocidad 1, que no pasan la regla de ≤ 17 car./s.
 */
export async function importarTareaMpt(taskId: string, n: NuevoProyecto, rehacerVoz = false) {
  if (!/^[0-9a-f-]{36}$/.test(taskId)) throw new Error("task_id de MPT inválido");
  const p = await crearFila(n);
  await db.proyecto.update({ where: { id: p.id }, data: { estado: "ensamblado" } });
  const cadena: TipoTrabajo[] = rehacerVoz ? ["voz.regenerar", "render.entregar"] : ["render.entregar"];
  await encolar(p.id, "proyecto.importar", { taskId, cadena });
  return p;
}
