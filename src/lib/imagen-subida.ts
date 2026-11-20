/**
 * Imágenes que sube la persona fuera de un proyecto (logo de una plantilla, imágenes de variantes de
 * anuncios, una foto para sacar colores). Se validan antes de escribir nada: formato por extensión,
 * tamaño, y los SVG pasan por `revisarSvg` (sin scripts ni referencias externas). El nombre sale del
 * hash del contenido, así subir dos veces lo mismo no duplica. Un logo vectorial (.ai, .pdf, .eps,
 * Affinity…) se convierte a SVG con VectorCraft y se guarda como .svg.
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { escribirAtomico } from "./archivos";
import { esVector } from "./formatos-vector";
import { revisarSvg } from "./svg";
import { aSvg } from "./vectorcraft";

export const EXT_IMAGEN = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);
export const MAX_IMAGEN = 20 * 1024 ** 2;

export async function guardarImagenSubida(archivo: unknown, carpeta: string, prefijo: string): Promise<{ abs: string; nombre: string; avisos: string[] }> {
  if (!(archivo instanceof File)) throw new Error("Falta la imagen");
  let ext = path.extname(archivo.name).toLowerCase();
  const vector = esVector(archivo.name);
  if (!EXT_IMAGEN.has(ext) && !vector) throw new Error(`Formato no admitido (${ext || "sin extensión"}). Usa PNG, JPG, WebP, SVG o un logo .ai, .pdf o .eps.`);
  if (archivo.size > MAX_IMAGEN) throw new Error("La imagen pasa de 20 MB");
  if (!archivo.size) throw new Error("La imagen está vacía");
  let datos: Buffer = Buffer.from(await archivo.arrayBuffer());
  let avisos: string[] = [];
  if (vector) {
    ({ svg: datos, avisos } = await aSvg(datos, archivo.name));
    ext = ".svg";
  }
  if (ext === ".svg") revisarSvg(datos.toString("utf8"));
  const nombre = `${prefijo}-${createHash("sha256").update(datos).digest("hex").slice(0, 12)}${ext}`;
  const abs = path.join(carpeta, nombre);
  await fs.mkdir(carpeta, { recursive: true });
  await escribirAtomico(abs, datos);
  return { abs, nombre, avisos };
}
