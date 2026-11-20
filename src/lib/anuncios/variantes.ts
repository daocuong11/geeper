/**
 * Variante de gancho: el mismo video con otra primera escena, para probar ganchos sin volver a
 * generar con la GPU. Copia el proyecto (geeper.json y sus assets) a uno nuevo, cambia el texto de la
 * primera escena y encola la voz nueva de esa escena (Kokoro de MPT, en CPU) y el render.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { crearCarpetas, guardarProyecto, registrarAssetsEnDb } from "../almacen";
import { encolar } from "../cola";
import { db } from "../db";
import type { Proyecto } from "../esquema";
import { escenasEnLinea } from "../linea";
import { versionDeProyecto } from "../render";
import { dirProyecto } from "../rutas";
import { slugDe } from "../servicios";

/** Aplica el gancho nuevo a la primera escena (función pura, para probarla). */
export function conGancho(original: Proyecto, gancho: string, nuevoId: string, nombre: string): { p: Proyecto; escena: string; antes: string } {
  const texto = gancho.replace(/\s+/g, " ").trim();
  if (texto.length < 3) throw new Error("Escribe el gancho nuevo");
  if (texto.length > 300) throw new Error("El gancho es demasiado largo para una escena (máx. 300 caracteres)");
  const p = structuredClone(original);
  const primera = escenasEnLinea(p)[0];
  if (!primera) throw new Error("El proyecto no tiene escenas");
  const e = p.escenas[primera.escena.id]!;
  const antes = e.texto;
  if (antes.replace(/\s+/g, " ").trim().toLowerCase() === texto.toLowerCase()) throw new Error("El gancho nuevo es igual al actual");
  // La voz nueva dirá este texto; las palabras, correcciones y recortes se rehacen al regenerarla.
  e.texto = texto;
  e.correcciones = [];
  e.recortes = [];
  p.id = nuevoId;
  p.nombre = nombre;
  p.origen = { ...p.origen, varianteDe: original.id, ganchoAnterior: antes };
  return { p, escena: e.id, antes };
}

export async function crearVarianteDeGancho(proyectoId: string, gancho: string, nombre: string) {
  const fila = await db.proyecto.findUniqueOrThrow({ where: { id: proyectoId } });
  const { p: original } = await versionDeProyecto(proyectoId);
  const nombreFinal = nombre.trim().slice(0, 120) || `${fila.nombre} · gancho B`;
  const slug = slugDe(nombreFinal);
  const nueva = await db.proyecto.create({
    data: { slug, nombre: nombreFinal, tema: fila.tema, formato: fila.formato, plantilla: fila.plantilla, flujo: fila.flujo, estado: "ensamblado" },
  });
  try {
    const { p, escena } = conGancho(original, gancho, nueva.id, nombreFinal);
    const origen = dirProyecto(fila.slug);
    const destino = await crearCarpetas(slug);
    for (const a of Object.values(p.assets)) {
      const dst = path.join(destino, a.ruta);
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await fs.copyFile(path.join(origen, a.ruta), dst);
    }
    await guardarProyecto(nueva.id, p, `Variante de gancho de «${fila.nombre}»`);
    await registrarAssetsEnDb(nueva.id, p);
    await encolar(nueva.id, "voz.regenerar", { escena, cadena: ["render.entregar"] });
    return nueva;
  } catch (e) {
    // Sin variante a medias: si algo falló, se borra la fila (y su carpeta, que es nueva).
    await db.proyecto.delete({ where: { id: nueva.id } }).catch(() => undefined);
    await fs.rm(dirProyecto(slug), { recursive: true, force: true }).catch(() => undefined);
    throw e;
  }
}
