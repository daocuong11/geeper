/**
 * Elige sola cómo mezclar una superposición recién subida: si casi todo el fondo es negro (luces,
 * destellos, polvo, partículas) se mezcla con «Aclarar» para que el negro desaparezca; si casi todo es
 * blanco (papel, manchas, garabatos) con «Oscurecer»; si ya trae transparencia o es una foto, normal.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MEZCLAS_SIMPLES, type Fusion, type MezclaSimple } from "./efectos-esquema";
import { ffmpeg } from "./media";

/** Lado de la muestra que se analiza (px). */
const LADO = 48;

export interface Deteccion {
  mezcla: MezclaSimple;
  fusion: Fusion | undefined;
  /** Para la persona: por qué se eligió. */
  motivo: string;
}

/** Clasifica una muestra RGBA de 8 bits. */
export function clasificarMezcla(rgba: Uint8Array): Deteccion {
  const n = Math.floor(rgba.length / 4);
  if (!n) return { mezcla: "normal", fusion: undefined, motivo: "sin muestra" };
  let transparentes = 0, oscuros = 0, claros = 0;
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4]!, g = rgba[i * 4 + 1]!, b = rgba[i * 4 + 2]!, a = rgba[i * 4 + 3]!;
    if (a < 250) {
      transparentes++;
      continue;
    }
    const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (l < 0.1) oscuros++;
    else if (l > 0.9) claros++;
  }
  if (transparentes / n > 0.05) return { mezcla: "normal", fusion: undefined, motivo: "ya trae transparencia" };
  if (oscuros / n >= 0.45) return { mezcla: "aclarar", fusion: MEZCLAS_SIMPLES.aclarar, motivo: "fondo negro: se ve sólo lo claro" };
  if (claros / n >= 0.45) return { mezcla: "oscurecer", fusion: MEZCLAS_SIMPLES.oscurecer, motivo: "fondo blanco: se ve sólo lo oscuro" };
  return { mezcla: "normal", fusion: undefined, motivo: "imagen completa" };
}

/** Detecta la mezcla de un archivo de imagen o video (un fotograma a 0,5 s). Si algo falla, normal. */
export async function detectarMezcla(ruta: string, esVideo: boolean): Promise<Deteccion> {
  if (/\.svg$/i.test(ruta)) return { mezcla: "normal", fusion: undefined, motivo: "SVG" };
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "geeper-mezcla-"));
  const salida = path.join(dir, "muestra.rgba");
  try {
    await ffmpeg([
      "-v", "error", ...(esVideo ? ["-ss", "0.5"] : []), "-i", ruta, "-frames:v", "1",
      "-vf", `scale=${LADO}:${LADO},format=rgba`, "-f", "rawvideo", salida,
    ]);
    return clasificarMezcla(new Uint8Array(await fs.readFile(salida)));
  } catch {
    return { mezcla: "normal", fusion: undefined, motivo: "no se pudo analizar" };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
