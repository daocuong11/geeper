/**
 * Campañas de anuncios desde la terminal (para Claude o a mano). Ver docs/ANUNCIOS.md.
 *
 *   pnpm tsx scripts/anuncio.ts listar
 *   pnpm tsx scripts/anuncio.ts ver <id>                              brief, conceptos y lo pendiente
 *   pnpm tsx scripts/anuncio.ts proponer <id> propuesta.json          valida y muestra las diferencias
 *   pnpm tsx scripts/anuncio.ts proponer <id> propuesta.json --aplicar  además la guarda
 *
 * propuesta.json: {"brief": {...}, "conceptos": [{...}], "quitar": ["c-id"]} (src/lib/anuncios/propuesta.ts).
 * Las afirmaciones nuevas entran sin aprobar; no se vinculan videos ni se marcan verificaciones.
 */
import fs from "node:fs";
import { db } from "../src/lib/db";
import { DatosCampana } from "../src/lib/anuncios/esquema";
import { aplicarPropuesta } from "../src/lib/anuncios/propuesta";
import type { Revision } from "../src/lib/anuncios/revision";
import { leerCampana, revisionDe } from "../src/lib/anuncios/servicio";

function pendientes(r: Revision) {
  return r.conceptos.map((c) => ({
    concepto: c.conceptoId,
    nombre: c.nombre,
    resumen: c.resumen,
    pendiente: [
      ...[...c.copy, ...c.video].map((x) => ({ ambito: "concepto", ...x })),
      ...c.ubicaciones.flatMap((u) => u.chequeos.map((x) => ({ ambito: u.ubicacion.nombre, ...x }))),
    ]
      .filter((x) => x.estado === "fail" || x.estado === "unknown")
      .map((x) => `[${x.estado}] ${x.ambito} · ${x.nombre}: ${x.evidencia}${x.accion ? ` → ${x.accion}` : ""}`),
  }));
}

async function main() {
  const [orden, id, ruta, bandera] = process.argv.slice(2);
  if (orden === "listar") {
    const filas = await db.campana.findMany({ orderBy: { actualizado: "desc" } });
    for (const f of filas) {
      const d = DatosCampana.safeParse(f.datos);
      console.log(`${f.id}  ${f.estado.padEnd(12)} ${f.nombre}  (${d.success ? d.data.conceptos.length : "?"} conceptos)`);
    }
    return;
  }
  if (!id) throw new Error("Uso: listar | ver <id> | proponer <id> <propuesta.json> [--aplicar]");
  const { fila, datos } = await leerCampana(id);
  if (orden === "ver") {
    const r = await revisionDe(datos);
    const { manuales: _m, ...resto } = datos;
    void _m;
    console.log(JSON.stringify({ id: fila.id, nombre: fila.nombre, estado: fila.estado, ...resto, revision: { total: r.resumen, conceptos: pendientes(r) } }, null, 2));
    return;
  }
  if (orden === "proponer") {
    if (!ruta) throw new Error("Falta propuesta.json");
    const { datos: nuevos, cambios } = aplicarPropuesta(datos, JSON.parse(fs.readFileSync(ruta, "utf8")));
    const [antes, despues] = [await revisionDe(datos), await revisionDe(nuevos)];
    console.log(`Campaña «${fila.nombre}». Propuesta válida. Cambios (${cambios.length}):`);
    for (const c of cambios) console.log(`  ${c}`);
    const f = (r: Revision) => `✓ ${r.resumen.pass} · ✕ ${r.resumen.fail} · ? ${r.resumen.unknown}`;
    console.log(`\nRevisión: ${f(antes)}  →  ${f(despues)}`);
    if (bandera === "--aplicar") {
      if (!cambios.length) return console.log("Nada que aplicar.");
      await db.campana.update({ where: { id }, data: { datos: nuevos as object } });
      console.log("Aplicada. Ábrela en /anuncios para revisarla y aprobar las afirmaciones.");
    } else console.log("\nNo se aplicó nada. Repite con --aplicar para guardarla.");
    return;
  }
  throw new Error(`Orden desconocida: ${orden}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
