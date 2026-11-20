/**
 * Busca la cara de cada clip visual de un proyecto ya importado y la guarda como versión nueva
 * (BRECHAS.md E4). Los proyectos nuevos lo hacen solos al importar.
 *
 *   pnpm tsx scripts/analizar-caras.ts <slug>            muestra qué encontró, sin guardar
 *   pnpm tsx scripts/analizar-caras.ts <slug> --aplicar  además lo guarda como versión nueva
 *   pnpm tsx scripts/analizar-caras.ts <slug> --rehacer  vuelve a analizar los que ya tenían foco
 */
import { guardarProyecto } from "../src/lib/almacen";
import { aplicarFocos, cubreConCara, detectarCaras, porAnalizar, posicionCara, sigueCara } from "../src/lib/caras";
import { db } from "../src/lib/db";
import { metricas } from "../src/lib/formatos";
import { escenasEnLinea, opcionesDe } from "../src/lib/linea";
import { versionDeProyecto } from "../src/lib/render";
import { dirProyecto } from "../src/lib/rutas";

async function main() {
  const [slug, ...banderas] = process.argv.slice(2);
  if (!slug) throw new Error("Uso: <slug> [--aplicar] [--rehacer]");
  const fila = await db.proyecto.findUniqueOrThrow({ where: { slug } });
  const { p: actual, numero } = await versionDeProyecto(fila.id);
  const base = banderas.includes("--rehacer")
    ? { ...actual, assets: Object.fromEntries(Object.entries(actual.assets).map(([k, a]) => [k, { ...a, foco: undefined }])) }
    : actual;
  const pendientes = porAnalizar(base);
  const ctx = { dir: dirProyecto(slug), log: (l: string) => console.log(l) };
  const focos = await detectarCaras(ctx, pendientes);
  const nuevo = aplicarFocos(base, focos);

  const { W, H } = metricas(nuevo.formato, opcionesDe(nuevo));
  console.log(`Proyecto ${slug} (versión ${numero}, ${nuevo.formato} ${W}×${H}): ${pendientes.length} clips analizados`);
  for (const e of escenasEnLinea(nuevo)) {
    const a = nuevo.assets[e.visual.asset]!;
    const f = a.foco;
    const que = !f
      ? "sin cara"
      : `cara en (${f.x.toFixed(2)}, ${f.y.toFixed(2)}), ancho ${f.ancho.toFixed(2)}, en ${Math.round(f.cobertura * 100)} % de ${f.muestras} muestras, se mueve ${f.dispersion.toFixed(2)}`;
    const encuadre = !sigueCara(e.visual, a)
      ? f ? `ancla fijada: ${e.visual.ancla}` : "como antes"
      : e.visual.ajuste === "contener" ? "contener (fijado a mano)" : cubreConCara(a, W, H) || e.visual.ajuste === "cubrir" ? `cubre siguiendo la cara: ${posicionCara(a, W, H)}` : "cara inestable o grande: como antes";
    console.log(`  ${e.escena.id} [${a.ruta} ${a.ancho}×${a.alto}] ${que} → ${encuadre}`);
  }
  if (banderas.includes("--aplicar")) {
    const n = await guardarProyecto(fila.id, nuevo, "Caras detectadas (YuNet) para el reencuadre");
    console.log(`\nGuardado como versión ${n}. Renderiza para verlo.`);
  } else console.log("\nNo se guardó nada. Repite con --aplicar.");
  await db.$disconnect();
}
void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
