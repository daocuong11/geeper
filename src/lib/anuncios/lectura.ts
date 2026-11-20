/**
 * Lectura de una prueba A/B terminada (claude-ads, ads-test): antes de estimar el efecto se revisa que
 * los datos estén completos y que se llegó a la muestra decidida; si no, no se declara ganador.
 *
 * Por cada tratamiento contra el control:
 *   diferencia = p_t − p_c, intervalo con error estándar sin agrupar,
 *   prueba z bilateral con proporción agrupada, α corregido por Bonferroni (α/k).
 */
import type { ResultadoChequeo } from "./esquema";
import { zInversa } from "./muestra";

/** Φ(x), normal estándar acumulada (Abramowitz y Stegun 7.1.26, error < 1,5e-7). */
export function normalAcumulada(x: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(x) / Math.SQRT2));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

export interface Conteo {
  unidades: number | null;
  conversiones: number | null;
}

export type Veredicto = "falta" | "temprano" | "gana" | "pierde" | "sin-diferencia" | "invalido";

export interface Comparacion {
  tratamiento: string;
  tasaControl: number;
  tasaTratamiento: number;
  diferencia: number;
  /** Diferencia relativa al control (0,2 = +20 %). */
  relativa: number | null;
  intervalo: [number, number];
  z: number;
  p: number;
  veredicto: Veredicto;
  texto: string;
}

export interface Lectura {
  ok: boolean;
  alfaCorregido: number;
  avisos: string[];
  comparaciones: Comparacion[];
  /** Una línea con la decisión de toda la prueba. */
  decision: string;
}

const pct = (x: number, d = 2) => `${(x * 100).toFixed(d).replace(".", ",")} %`;

function valido(c: Conteo | undefined): c is { unidades: number; conversiones: number } {
  return Boolean(c && c.unidades != null && c.conversiones != null && c.unidades > 0 && c.conversiones >= 0);
}

export function leerPrueba(e: {
  control: string | null;
  tratamientos: string[];
  resultados: Record<string, Conteo>;
  alfa: number;
  /** Muestra por variante decidida antes de lanzar (null si no se calculó). */
  planeada: number | null;
  guardarrailes: ResultadoChequeo;
  nombres: Record<string, string>;
}): Lectura {
  const avisos: string[] = [];
  const k = Math.max(1, e.tratamientos.length);
  const alfaCorregido = e.alfa / k;
  const nombre = (id: string) => e.nombres[id] ?? id;
  if (!e.control || !e.tratamientos.length) {
    return { ok: false, alfaCorregido, avisos, comparaciones: [], decision: "Elige el control y al menos un tratamiento." };
  }
  const c = e.resultados[e.control];
  if (!valido(c)) return { ok: false, alfaCorregido, avisos, comparaciones: [], decision: `Faltan los datos del control («${nombre(e.control)}»).` };
  if (c.conversiones > c.unidades) return { ok: false, alfaCorregido, avisos, comparaciones: [], decision: "El control tiene más conversiones que unidades: revisa los datos." };
  if (e.planeada == null) avisos.push("No hay tamaño de muestra decidido: la lectura es orientativa.");
  const z = zInversa(1 - alfaCorregido / 2);
  const pc = c.conversiones / c.unidades;

  const comparaciones = e.tratamientos.map((id): Comparacion => {
    const t = e.resultados[id];
    const base = { tratamiento: id, tasaControl: pc, tasaTratamiento: 0, diferencia: 0, relativa: null, intervalo: [0, 0] as [number, number], z: 0, p: 1 };
    if (!valido(t)) return { ...base, veredicto: "falta", texto: `Faltan los datos de «${nombre(id)}».` };
    if (t.conversiones > t.unidades) return { ...base, veredicto: "invalido", texto: `«${nombre(id)}» tiene más conversiones que unidades.` };
    const pt = t.conversiones / t.unidades;
    const dif = pt - pc;
    const se = Math.sqrt((pc * (1 - pc)) / c.unidades + (pt * (1 - pt)) / t.unidades);
    const pa = (c.conversiones + t.conversiones) / (c.unidades + t.unidades);
    const se0 = Math.sqrt(pa * (1 - pa) * (1 / c.unidades + 1 / t.unidades));
    const zz = se0 > 0 ? dif / se0 : 0;
    const p = se0 > 0 ? 2 * (1 - normalAcumulada(Math.abs(zz))) : 1;
    const r = { ...base, tasaTratamiento: pt, diferencia: dif, relativa: pc > 0 ? dif / pc : null, intervalo: [dif - z * se, dif + z * se] as [number, number], z: zz, p };
    const rel = r.relativa != null ? ` (${r.relativa >= 0 ? "+" : ""}${pct(r.relativa, 1)})` : "";
    const resumen = `${pct(pt)} contra ${pct(pc)}${rel}, intervalo ${pct(r.intervalo[0])} a ${pct(r.intervalo[1])}, p ${p < 0.001 ? "< 0,001" : `= ${p.toFixed(3).replace(".", ",")}`}`;
    if (e.planeada != null && (c.unidades < e.planeada || t.unidades < e.planeada)) {
      const falta = Math.max(0, e.planeada - Math.min(c.unidades, t.unidades));
      return { ...r, veredicto: "temprano", texto: `Todavía no: faltan ~${falta.toLocaleString("es")} unidades para la muestra decidida. Provisional: ${resumen}.` };
    }
    if (p < alfaCorregido && dif > 0) return { ...r, veredicto: "gana", texto: `«${nombre(id)}» supera al control: ${resumen}.` };
    if (p < alfaCorregido && dif < 0) return { ...r, veredicto: "pierde", texto: `«${nombre(id)}» queda por debajo del control: ${resumen}.` };
    return { ...r, veredicto: "sin-diferencia", texto: `Sin diferencia detectable con esta muestra: ${resumen}.` };
  });

  let decision: string;
  const ganan = comparaciones.filter((x) => x.veredicto === "gana").sort((a, b) => b.diferencia - a.diferencia);
  if (comparaciones.some((x) => x.veredicto === "falta" || x.veredicto === "invalido")) decision = "Completa o corrige los datos antes de decidir.";
  else if (comparaciones.some((x) => x.veredicto === "temprano")) decision = "Sigue corriendo: aún no se llegó a la muestra decidida. No cortes la prueba por un resultado parcial.";
  else if (ganan.length) {
    const g = nombre(ganan[0]!.tratamiento);
    decision =
      e.guardarrailes === "fail" ? `«${g}» gana en la métrica primaria pero rompe un guardarraíl: no lo escales sin entender por qué.`
      : e.guardarrailes === "pass" ? `Escala «${g}»: gana en la métrica primaria y los guardarraíles se mantuvieron.`
      : `«${g}» gana en la métrica primaria. Confirma los guardarraíles antes de escalarlo.`;
  } else if (comparaciones.every((x) => x.veredicto === "pierde")) decision = "Quédate con el control: ningún tratamiento lo supera.";
  else decision = "Sin ganador claro: quédate con el control (o con el más barato) y prueba una idea más distinta.";
  return { ok: true, alfaCorregido, avisos, comparaciones, decision };
}
