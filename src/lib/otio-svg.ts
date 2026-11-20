/**
 * FilmCraft (0.20) no lee SVG: una superposición SVG quedaría «sin conexión» en el .otio. Antes de
 * exportar, cada SVG que usa el proyecto se pasa a PNG con VectorCraft en <proyecto>/exportes/svg/ y el
 * .otio apunta a ese PNG (`aOtio(..., sustitutos)`). Si VectorCraft no está, el SVG va tal cual.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { Proyecto } from "./esquema";
import { correr } from "./proceso";
import { VECTORCRAFT_CLI } from "./rutas";
import { esSvg } from "./svg";

/** Resolución del PNG: de sobra para un logo a pantalla completa en 4K. */
const PPI = 300;

export async function pngsParaOtio(p: Proyecto, dirProyecto: string): Promise<Record<string, string>> {
  const usados = new Set(p.pistas.flatMap((pi) => pi.clips.map((c) => c.asset)));
  const svgs = Object.values(p.assets).filter((a) => usados.has(a.id) && esSvg(a.ruta));
  if (!svgs.length) return {};
  const dir = path.join(dirProyecto, "exportes", "svg");
  await fs.mkdir(dir, { recursive: true });
  const out: Record<string, string> = {};
  for (const a of svgs) {
    const png = path.join(dir, `${a.id}.png`);
    const r = await correr(VECTORCRAFT_CLI, ["--safe-mode", "convert", path.resolve(dirProyecto, a.ruta), png, "--ppi", String(PPI)], { permitirFallo: true, timeout: 120_000 }).catch(() => null);
    if (r?.codigo === 0 && (await fs.stat(png).then((s) => s.size > 0, () => false))) out[a.id] = png;
  }
  return out;
}
