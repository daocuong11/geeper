/**
 * Variantes de un video para probar anuncios sin volver a generar con la GPU. Copia el proyecto
 * (geeper.json y sus assets) a uno nuevo y le cambia lo que pida la variante:
 *  - gancho: el texto de la primera escena (se encola su voz nueva, Kokoro de MPT en CPU, y el render),
 *  - texto: un título en pantalla al inicio,
 *  - imagen: el visual de la primera escena,
 *  - cta: el botón de la tarjeta final sólo de este video.
 * El original no se toca (como la combinación de datos de DesignCraft: un documento nuevo por fila).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { crearCarpetas, describirAsset, guardarProyecto, registrarAssetsEnDb } from "../almacen";
import { encolar } from "../cola";
import { db } from "../db";
import { aplicarEdicion, reemplazarVisual } from "../ediciones";
import type { Asset, Proyecto } from "../esquema";
import { LICENCIAS } from "../licencias";
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

export interface CambiosVariante {
  gancho?: string;
  texto?: string;
  cta?: string;
  /** Asset ya copiado al proyecto nuevo (lo prepara `crearVariante`). */
  imagen?: Asset;
}

/** Todos los cambios de una variante sobre una copia del proyecto (función pura, para probarla). */
export function conCambios(original: Proyecto, c: CambiosVariante, nuevoId: string, nombre: string): { p: Proyecto; escenaVoz: string | null } {
  const gancho = c.gancho?.trim();
  const texto = c.texto?.replace(/\s+/g, " ").trim();
  const cta = c.cta?.replace(/\s+/g, " ").trim();
  if (!gancho && !texto && !cta && !c.imagen) throw new Error("La variante no cambia nada: escribe un gancho, un texto, un botón o elige una imagen");
  let p: Proyecto;
  let escenaVoz: string | null = null;
  if (gancho) {
    const r = conGancho(original, gancho, nuevoId, nombre);
    p = r.p;
    escenaVoz = r.escena;
  } else {
    p = structuredClone(original);
    p.id = nuevoId;
    p.nombre = nombre;
    p.origen = { ...p.origen, varianteDe: original.id };
  }
  const primera = escenasEnLinea(p)[0];
  if (!primera) throw new Error("El proyecto no tiene escenas");
  if (c.imagen) p = reemplazarVisual(p, primera.escena.id, c.imagen);
  if (texto) {
    if (texto.length > 160) throw new Error("El texto en pantalla es demasiado largo (máx. 160 caracteres)");
    const duracion = Math.max(0.3, Math.min(3, primera.duracion - 0.2));
    p = aplicarEdicion(p, { tipo: "agregarTexto", texto: { texto, inicio: 0.2, duracion, estilo: "titulo", posicion: "arriba" } });
  }
  if (cta) {
    if (cta.length > 60) throw new Error("El botón final es demasiado largo (máx. 60 caracteres)");
    p = aplicarEdicion(p, { tipo: "cambiarCta", cta });
  }
  p.origen = { ...p.origen, cambiosVariante: { gancho: gancho ?? null, texto: texto ?? null, cta: cta ?? null, imagen: c.imagen?.id ?? null } };
  return { p, escenaVoz };
}

/**
 * Crea el proyecto variante y encola lo que haga falta: voz nueva + render si cambió el gancho, sólo
 * render si no. `imagenAbs` es una imagen ya validada (ver imagen-subida.ts) que se copia al proyecto.
 */
export async function crearVariante(proyectoId: string, cambios: Omit<CambiosVariante, "imagen"> & { imagenAbs?: string }, nombre: string) {
  const fila = await db.proyecto.findUniqueOrThrow({ where: { id: proyectoId } });
  const { p: original } = await versionDeProyecto(proyectoId);
  const nombreFinal = nombre.trim().slice(0, 120) || `${fila.nombre} · variante`;
  const slug = slugDe(nombreFinal);
  const nueva = await db.proyecto.create({
    data: { slug, nombre: nombreFinal, tema: fila.tema, formato: fila.formato, plantilla: fila.plantilla, flujo: fila.flujo, estado: "ensamblado" },
  });
  try {
    const origen = dirProyecto(fila.slug);
    const destino = await crearCarpetas(slug);
    for (const a of Object.values(original.assets)) {
      const dst = path.join(destino, a.ruta);
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await fs.copyFile(path.join(origen, a.ruta), dst);
    }
    let imagen: Asset | undefined;
    if (cambios.imagenAbs) {
      const ext = path.extname(cambios.imagenAbs).toLowerCase();
      const id = `variante-${path.basename(cambios.imagenAbs, ext).replace(/[^a-z0-9-]/gi, "").slice(-12)}`;
      const ruta = `assets/${id}${ext}`;
      await fs.mkdir(path.join(destino, "assets"), { recursive: true });
      await fs.copyFile(cambios.imagenAbs, path.join(destino, ruta));
      imagen = await describirAsset(destino, ruta, { id, tipo: "imagen", source: "archivo", licencia: LICENCIAS.archivo!, regenerar: { nombreOriginal: path.basename(cambios.imagenAbs) } });
    }
    const { p, escenaVoz } = conCambios(original, { ...cambios, imagen }, nueva.id, nombreFinal);
    const version = await guardarProyecto(nueva.id, p, `Variante de «${fila.nombre}»`);
    await registrarAssetsEnDb(nueva.id, p);
    if (escenaVoz) await encolar(nueva.id, "voz.regenerar", { escena: escenaVoz, cadena: ["render.entregar"] });
    else await encolar(nueva.id, "render.entregar", { version });
    return nueva;
  } catch (e) {
    // Sin variante a medias: si algo falló, se borra la fila (y su carpeta, que es nueva).
    await db.proyecto.delete({ where: { id: nueva.id } }).catch(() => undefined);
    await fs.rm(dirProyecto(slug), { recursive: true, force: true }).catch(() => undefined);
    throw e;
  }
}

export async function crearVarianteDeGancho(proyectoId: string, gancho: string, nombre: string) {
  const fila = await db.proyecto.findUniqueOrThrow({ where: { id: proyectoId } });
  return crearVariante(proyectoId, { gancho }, nombre.trim() || `${fila.nombre} · gancho B`);
}
