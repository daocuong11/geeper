/**
 * Uso: pnpm tsx scripts/exportar-otio.ts <slug> [salida.otio]
 * Exporta el proyecto a OpenTimelineIO para terminarlo en FilmCraft, Resolve o Premiere.
 * Por defecto escribe ~/geeper-data/<slug>/exportes/<slug>.otio.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { leerProyecto } from "../src/lib/almacen";
import { NO_VIAJA, aOtio } from "../src/lib/otio";
import { pngsParaOtio } from "../src/lib/otio-svg";
import { dirProyecto } from "../src/lib/rutas";

async function main() {
  const [slug, salida] = process.argv.slice(2);
  if (!slug) throw new Error("Uso: exportar-otio.ts <slug> [salida.otio]");
  const p = await leerProyecto(slug);
  if (!p) throw new Error(`No existe el proyecto ${slug}`);
  const destino = salida ?? path.join(dirProyecto(slug), "exportes", `${slug}.otio`);
  await fs.mkdir(path.dirname(destino), { recursive: true });
  await fs.writeFile(destino, JSON.stringify(aOtio(p, dirProyecto(slug), await pngsParaOtio(p, dirProyecto(slug))), null, 2));
  console.log(`OTIO: ${destino}\nNo viaja en el .otio: ${NO_VIAJA.join("; ")}.`);
}
void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
