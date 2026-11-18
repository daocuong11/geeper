/** Uso: pnpm tsx scripts/revisar-subtitulos.ts <slug> [formato] — QC de subtítulos sin renderizar. */
import { leerProyecto } from "../src/lib/almacen";
import { Formato } from "../src/lib/esquema";
import { duracionEscenas, todosLosGrupos } from "../src/lib/linea";
import { revisarSubtitulos } from "../src/lib/qc";

async function main() {
  const [slug, formato] = process.argv.slice(2);
  const p = await leerProyecto(slug!);
  if (!p) throw new Error("No existe");
  if (formato) p.formato = Formato.parse(formato);
  // GEEPER_SIM_VELOCIDAD=0.9 simula una voz más lenta (escala todos los tiempos).
  const k = 1 / Number(process.env.GEEPER_SIM_VELOCIDAD ?? 1);
  for (const pi of p.pistas) for (const c of pi.clips) c.rango = { inicio: c.rango.inicio * k, duracion: c.rango.duracion * k };
  for (const e of Object.values(p.escenas)) e.palabras = e.palabras.map((w) => ({ ...w, inicio: w.inicio * k, fin: w.fin * k }));
  const r = revisarSubtitulos(p.formato, todosLosGrupos(p), duracionEscenas(p));
  console.log(JSON.stringify({ ...r, malos: r.malos.length, ejemplos: r.malos.slice(0, 6) }, null, 1));
}
void main();
