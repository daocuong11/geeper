/**
 * Propuestas de cambio a geeper.json (para Claude o a mano).
 *
 *   pnpm tsx scripts/proponer.ts <slug> propuesta.json            valida y muestra las diferencias
 *   pnpm tsx scripts/proponer.ts <slug> propuesta.json --aplicar  además la guarda como versión nueva
 *
 * propuesta.json puede ser:
 *   - una lista de ediciones: [{"tipo":"quitarEscena","escena":"e03"}, ...]  (ver src/lib/ediciones.ts)
 *   - un geeper.json completo (se valida entero con el esquema).
 * Nada se aplica sin --aplicar.
 */
import fs from "node:fs";
import { guardarProyecto } from "../src/lib/almacen";
import { db } from "../src/lib/db";
import { aplicarEdicion, Edicion } from "../src/lib/ediciones";
import { validarProyecto, type Proyecto } from "../src/lib/esquema";
import { escenasEnLinea, todosLosGrupos } from "../src/lib/linea";
import { versionDeProyecto } from "../src/lib/render";

function resumen(p: Proyecto) {
  return {
    "formato/plantilla": `${p.formato} · ${p.plantilla}`,
    voz: `${p.voz.voz} a ${p.voz.velocidad}`,
    mostrar: p.mostrar.map((m) => `${m.de}=${m.a}`).join(", ") || "—",
    destino: `uso comercial ${p.comercial ? "sí" : "no"} · plataformas ${p.plataformas.join(", ") || "—"} · máster ${p.entrega.master ? "sí" : "no"} · marca arriba ${p.marca ? "sí" : "no"}`,
    textos: p.textos.map((t) => `${t.id} ${t.inicio.toFixed(1)}+${t.duracion.toFixed(1)} s ${t.estilo}/${t.posicion}: ${t.texto}`),
    escenas: escenasEnLinea(p).map((e) => `${e.escena.id} ${e.duracion.toFixed(2)} s [${p.assets[e.visual.asset]!.ruta}] ${e.escena.texto.slice(0, 50)}`),
    subtitulos: todosLosGrupos(p).map((g) => `${g.inicio.toFixed(2)} ${g.texto}`),
  };
}

function diff(a: string[], b: string[]): string[] {
  const out: string[] = [];
  const sa = new Set(a);
  const sb = new Set(b);
  for (const x of a) if (!sb.has(x)) out.push(`- ${x}`);
  for (const x of b) if (!sa.has(x)) out.push(`+ ${x}`);
  return out;
}

async function main() {
  const [slug, ruta, bandera] = process.argv.slice(2);
  if (!slug || !ruta) throw new Error("Uso: <slug> <propuesta.json> [--aplicar]");
  const fila = await db.proyecto.findUniqueOrThrow({ where: { slug } });
  const { p: actual, numero } = await versionDeProyecto(fila.id);
  const entrada = JSON.parse(fs.readFileSync(ruta, "utf8")) as unknown;
  let nuevo: Proyecto;
  if (Array.isArray(entrada)) {
    nuevo = actual;
    for (const e of entrada) nuevo = aplicarEdicion(nuevo, Edicion.parse(e));
  } else nuevo = validarProyecto(entrada);
  const a = resumen(actual);
  const b = resumen(nuevo);
  console.log(`Proyecto ${slug}, versión actual ${numero}. Propuesta válida. Diferencias:`);
  for (const k of Object.keys(a) as (keyof typeof a)[]) {
    const va = ([] as string[]).concat(a[k]);
    const vb = ([] as string[]).concat(b[k]);
    const d = diff(va, vb);
    if (d.length) console.log(`\n## ${k}\n${d.join("\n")}`);
  }
  if (bandera === "--aplicar") {
    const n = await guardarProyecto(fila.id, nuevo, "Propuesta aplicada desde la línea de comandos");
    console.log(`\nAplicada como versión ${n}. Renderiza desde la UI para verla.`);
  } else console.log("\nNo se aplicó nada. Repite con --aplicar para guardarla como versión nueva.");
  await db.$disconnect();
}
void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
