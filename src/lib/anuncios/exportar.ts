/** Exporta una campaña: copy deck en Markdown (para personas) y checklist en CSV (para quien lanza). */
import { CATEGORIAS_SENSIBLES, MARCOS, OBJETIVOS, UNIDADES_PRUEBA, VARIABLES_PRUEBA, ubicacion } from "./catalogo";
import type { DatosCampana } from "./esquema";
import { tamanoMuestra } from "./muestra";
import type { Chequeo, Revision } from "./revision";

const ICONO = { pass: "✅", fail: "❌", unknown: "❔", not_applicable: "—" } as const;
const NOMBRE = { pass: "pasa", fail: "falla", unknown: "sin saber", not_applicable: "no aplica" } as const;

function linea(c: Chequeo): string {
  const extra = [c.evidencia, c.accion ? `→ ${c.accion}` : "", c.fecha ? `(${c.fecha})` : ""].filter(Boolean).join(" ");
  return `- ${ICONO[c.estado]} **${c.nombre}** (${NOMBRE[c.estado]}): ${extra}`;
}

export function aMarkdown(nombre: string, estado: string, d: DatosCampana, r: Revision): string {
  const b = d.brief;
  const out: string[] = [];
  out.push(`# ${nombre}`, "", `Estado: ${estado} · Revisión: ${r.resumen.pass} pasan, ${r.resumen.fail} fallan, ${r.resumen.unknown} sin saber, ${r.resumen.not_applicable} no aplican.`, "");
  out.push("## Brief", "");
  const filas: [string, string][] = [
    ["Marca", b.marca], ["Producto", b.producto], ["Objetivo", OBJETIVOS[b.objetivo]], ["Audiencia", b.audiencia],
    ["Oferta", b.oferta], ["Destino", b.destino], ["Botón CTA", b.botonCta],
    ["Ubicaciones", b.ubicaciones.map((u) => ubicacion(u)?.nombre ?? u).join(", ")],
    ["Categoría sensible", CATEGORIAS_SENSIBLES[b.categoria]],
  ];
  for (const [k, v] of filas) if (v) out.push(`- **${k}:** ${v.replace(/\n+/g, " ")}`);
  if (b.afirmaciones.length) {
    out.push("", "### Afirmaciones", "");
    for (const a of b.afirmaciones) out.push(`- ${a.aprobada ? "✅ aprobada" : "⏳ sin aprobar"}: «${a.texto}»${a.prueba ? ` — prueba: ${a.prueba}` : ""}`);
  }
  for (const c of d.conceptos) {
    const rc = r.conceptos.find((x) => x.conceptoId === c.id);
    out.push("", `## Concepto: ${c.nombre}`, "");
    const campos: [string, string][] = [
      ["Marco", MARCOS[c.marco]?.nombre ?? c.marco], ["Insight", c.insight], ["Gancho", c.gancho], ["Promesa", c.promesa],
      ["Narrativa", c.narrativa], ["CTA", c.cta], ["Objeciones", c.objeciones], ["Hipótesis", c.hipotesis],
    ];
    for (const [k, v] of campos) if (v && v !== "Sin marco") out.push(`- **${k}:** ${v.replace(/\n+/g, " ")}`);
    if (c.guion.trim()) out.push("", "**Guion:**", "", ...c.guion.trim().split("\n").map((l) => `> ${l}`));
    if (rc) {
      out.push("", `### Revisión (${rc.resumen.pass} ✅ · ${rc.resumen.fail} ❌ · ${rc.resumen.unknown} ❔)`, "");
      for (const ch of [...rc.copy, ...rc.video]) out.push(linea(ch));
      for (const u of rc.ubicaciones) {
        out.push("", `**${u.ubicacion.nombre}** · [specs](${u.ubicacion.specs}) · [políticas](${u.ubicacion.politicas})`, "");
        for (const ch of u.chequeos) out.push(linea(ch));
      }
    }
  }
  const p = d.prueba;
  if (p.hipotesis || p.control) {
    const nombreDe = (id: string | null) => d.conceptos.find((c) => c.id === id)?.nombre ?? "—";
    out.push("", "## Prueba", "");
    const m = tamanoMuestra({ tasaBase: p.tasaBase, efectoMinimo: p.efectoMinimo, alfa: p.alfa, potencia: p.potencia, tratamientos: p.tratamientos.length || 1, volumenDiario: p.volumenDiario });
    const campos: [string, string][] = [
      ["Decisión", p.decision], ["Hipótesis", p.hipotesis], ["Variable (una sola)", VARIABLES_PRUEBA[p.variable]],
      ["Unidad de aleatorización", UNIDADES_PRUEBA[p.unidad]], ["Control", nombreDe(p.control)],
      ["Tratamientos", p.tratamientos.map(nombreDe).join(", ")], ["Métrica primaria", p.metrica], ["Guardarraíles", p.guardarrailes],
      ["Tamaño", m.ok ? `${m.porVariante.toLocaleString("es")} por variante (${m.total.toLocaleString("es")} en total)${m.dias ? `, ~${m.dias} días` : ""}` : `falta ${m.falta.join(" y ")}`],
      ["Regla de parada", p.reglaParada],
    ];
    for (const [k, v] of campos) if (v) out.push(`- **${k}:** ${v.replace(/\n+/g, " ")}`);
  }
  out.push("", "---", "Generado por Geeper. Los resultados «sin saber» piden un dato o una verificación; no se adivinan.", "");
  return out.join("\n");
}

function celda(s: string): string {
  const t = s.replace(/\r?\n/g, " ");
  return /[",;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function aCsv(r: Revision): string {
  const filas = [["concepto", "ambito", "chequeo", "estado", "evidencia", "accion", "fuente", "fecha"]];
  for (const c of r.conceptos) {
    for (const ch of c.copy) filas.push([c.nombre, "copy", ch.nombre, ch.estado, ch.evidencia, ch.accion ?? "", ch.fuente ?? "", ch.fecha ?? ""]);
    for (const ch of c.video) filas.push([c.nombre, "video", ch.nombre, ch.estado, ch.evidencia, ch.accion ?? "", ch.fuente ?? "", ch.fecha ?? ""]);
    for (const u of c.ubicaciones) for (const ch of u.chequeos) filas.push([c.nombre, u.ubicacion.nombre, ch.nombre, ch.estado, ch.evidencia, ch.accion ?? "", ch.fuente ?? "", ch.fecha ?? ""]);
  }
  return filas.map((f) => f.map(celda).join(",")).join("\n") + "\n";
}
