/**
 * Propuestas de Claude (o de quien sea) a una campaña: conceptos y campos del brief, validados y
 * mostrados como diferencias antes de aplicarlos (como scripts/proponer.ts con geeper.json).
 *
 * Límites a propósito (claude-ads: la persona aprueba):
 *  - una afirmación nueva entra SIN aprobar; las existentes conservan su aprobación,
 *  - no se vinculan videos (proyectoId) ni se marcan verificaciones manuales,
 *  - nada se guarda sin --aplicar.
 */
import { z } from "zod";
import { Afirmacion, Brief, Concepto, DatosCampana, type DatosCampana as Datos } from "./esquema";

const ConceptoPropuesto = Concepto.partial().omit({ proyectoId: true }).extend({ id: z.string().optional() }).strict();
const AfirmacionPropuesta = Afirmacion.partial().omit({ aprobada: true }).extend({ texto: z.string().max(300) }).strict();

export const Propuesta = z.object({
  brief: Brief.partial().omit({ afirmaciones: true }).extend({ afirmaciones: z.array(AfirmacionPropuesta).optional() }).strict().optional(),
  conceptos: z.array(ConceptoPropuesto).max(30).optional(),
  /** Ids de conceptos a quitar (sólo si no tienen video). */
  quitar: z.array(z.string()).optional(),
}).strict();
export type Propuesta = z.infer<typeof Propuesta>;

function idLibre(prefijo: string, usados: Set<string>, base: string): string {
  const raiz = `${prefijo}-${base.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "nuevo"}`;
  let id = raiz;
  for (let i = 2; usados.has(id); i++) id = `${raiz}-${i}`;
  usados.add(id);
  return id;
}

export function aplicarPropuesta(actual: Datos, entrada: unknown): { datos: Datos; cambios: string[] } {
  const p = Propuesta.parse(entrada);
  // Zod rellena los valores por defecto aun en esquemas parciales: sólo cuentan las claves que la
  // propuesta trae de verdad (si no, un campo omitido borraría el valor actual).
  const crudo = entrada as { brief?: Record<string, unknown>; conceptos?: Record<string, unknown>[] };
  const trae = (o: Record<string, unknown> | undefined, k: string) => Boolean(o && Object.prototype.hasOwnProperty.call(o, k));
  const d = structuredClone(actual);
  const cambios: string[] = [];
  const corto = (v: unknown) => {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return s.length > 70 ? `${s.slice(0, 67)}…` : s;
  };

  if (p.brief) {
    const { afirmaciones, ...resto } = p.brief;
    for (const [k, v] of Object.entries(resto)) {
      if (!trae(crudo.brief, k)) continue;
      const antes = (d.brief as Record<string, unknown>)[k];
      if (JSON.stringify(antes) !== JSON.stringify(v)) {
        (d.brief as Record<string, unknown>)[k] = v;
        cambios.push(`brief.${k}: ${corto(antes)} → ${corto(v)}`);
      }
    }
    if (afirmaciones) {
      const usados = new Set(d.brief.afirmaciones.map((a) => a.id));
      const crudas = (crudo.brief?.afirmaciones ?? []) as Record<string, unknown>[];
      for (const [j, a] of afirmaciones.entries()) {
        const existente = a.id ? d.brief.afirmaciones.find((x) => x.id === a.id) : undefined;
        if (existente) {
          const textoCambia = a.texto !== existente.texto;
          Object.assign(existente, { texto: a.texto, prueba: trae(crudas[j], "prueba") ? (a.prueba ?? "") : existente.prueba });
          // Si cambia lo que se afirma, la aprobación anterior ya no vale.
          if (textoCambia) existente.aprobada = false;
          cambios.push(`afirmación ${existente.id} editada${textoCambia ? " (queda sin aprobar)" : ""}`);
        } else {
          const id = idLibre("af", usados, a.texto);
          d.brief.afirmaciones.push({ id, texto: a.texto, prueba: a.prueba ?? "", aprobada: false });
          cambios.push(`+ afirmación ${id} (sin aprobar): «${corto(a.texto)}»`);
        }
      }
    }
  }

  if (p.quitar?.length) {
    for (const id of p.quitar) {
      const c = d.conceptos.find((x) => x.id === id);
      if (!c) throw new Error(`No existe el concepto ${id}`);
      if (c.proyectoId) throw new Error(`El concepto ${id} tiene video: desvincúlalo en la app antes de quitarlo`);
      d.conceptos = d.conceptos.filter((x) => x.id !== id);
      d.manuales = Object.fromEntries(Object.entries(d.manuales).filter(([k]) => !k.startsWith(`${id}:`)));
      cambios.push(`- concepto ${id} («${c.nombre}»)`);
    }
  }

  if (p.conceptos) {
    const usados = new Set(d.conceptos.map((c) => c.id));
    for (const [i, c] of p.conceptos.entries()) {
      const existente = c.id ? d.conceptos.find((x) => x.id === c.id) : undefined;
      const { id: _id, ...campos } = c;
      void _id;
      if (existente) {
        for (const [k, v] of Object.entries(campos)) {
          if (!trae(crudo.conceptos?.[i], k)) continue;
          const antes = (existente as Record<string, unknown>)[k];
          if (v !== undefined && JSON.stringify(antes) !== JSON.stringify(v)) {
            (existente as Record<string, unknown>)[k] = v;
            cambios.push(`concepto ${existente.id}.${k}: ${corto(antes)} → ${corto(v)}`);
          }
        }
      } else {
        if (!campos.nombre) throw new Error("Cada concepto nuevo necesita «nombre»");
        const id = c.id && !usados.has(c.id) && /^[a-z0-9-]{1,40}$/.test(c.id) ? (usados.add(c.id), c.id) : idLibre("c", usados, campos.nombre);
        d.conceptos.push(Concepto.parse({ ...campos, id, proyectoId: null }));
        cambios.push(`+ concepto ${id} («${campos.nombre}»)`);
      }
    }
  }
  return { datos: DatosCampana.parse(d), cambios };
}
