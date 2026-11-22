/**
 * «Abrir en FilmCraft»: el proyecto se abre en la FilmCraft de Media (la versión web, dentro de Geeper),
 * sin zip ni guía. FilmCraft corre en un iframe del mismo origen con `?host=parent` y Geeper le manda los
 * archivos por `postMessage` (`filmcraft:open`, ver HOSTING.md de filmcraft-web): primero cada medio, después
 * la línea de tiempo (.otio) y los subtítulos (.srt). Lo que FilmCraft guarda o exporta vuelve por
 * `filmcraft:save` y queda en la carpeta del proyecto (`editor/`).
 *
 * La versión web no lee el disco: sólo ve los archivos que se le mandan, por su nombre. Por eso en el .otio
 * cada medio se referencia **sólo por su nombre** (probado con FilmCraft 0.20.1 el 2026-11-21: con la ruta
 * absoluta los clips quedan «offline»; con el nombre se enlazan solos). Dos medios con el mismo nombre en
 * carpetas distintas reciben nombres únicos.
 */
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { Proyecto } from "./esquema";
import { aSrt, duracionEscenas, todosLosGrupos } from "./linea";
import { aOtio } from "./otio";

type J = Record<string, unknown>;

/** Lo más grande que FilmCraft acepta por `filmcraft:open` (HOSTING.md, «Trust and limits»). */
export const MAX_ARCHIVO_FILMCRAFT = 512 * 1024 * 1024;

export interface MedioFilmcraft {
  /** Nombre único con el que va a FilmCraft y con el que lo nombra el .otio. */
  nombre: string;
  abs: string;
}

const desdeUrl = (u: string) => decodeURIComponent(u.slice("file://".length));

/**
 * Cambia cada `target_url` file:// por un nombre único y devuelve qué archivo es cada nombre (función pura
 * salvo por no tocar el original: devuelve una copia).
 */
export function otioParaFilmcraft(otio: J): { otio: J; medios: MedioFilmcraft[] } {
  const porRuta = new Map<string, string>();
  const usados = new Set<string>();
  const nombreDe = (abs: string) => {
    const ya = porRuta.get(abs);
    if (ya) return ya;
    const ext = path.extname(abs);
    const base = path.basename(abs, ext).replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 100) || "medio";
    let nombre = `${base}${ext}`;
    for (let n = 2; usados.has(nombre.toLowerCase()); n++) nombre = `${base}-${n}${ext}`;
    usados.add(nombre.toLowerCase());
    porRuta.set(abs, nombre);
    return nombre;
  };
  const recorrer = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(recorrer);
    if (!x || typeof x !== "object") return x;
    const o = x as J;
    if (o.OTIO_SCHEMA === "ExternalReference.1" && typeof o.target_url === "string" && o.target_url.startsWith("file://")) {
      const nombre = nombreDe(desdeUrl(o.target_url));
      return { ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, recorrer(v)])), name: nombre, target_url: nombre };
    }
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, recorrer(v)]));
  };
  const nuevo = recorrer(otio) as J;
  return { otio: nuevo, medios: [...porRuta].map(([abs, nombre]) => ({ nombre, abs })) };
}

/** Los PNG de los SVG que ya se convirtieron (otio-svg.ts los deja en exportes/svg): sin volver a convertir. */
export function sustitutosExistentes(p: Proyecto, dirProyecto: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of Object.values(p.assets)) {
    const png = path.join(dirProyecto, "exportes", "svg", `${a.id}.png`);
    if (existsSync(png)) out[a.id] = png;
  }
  return out;
}

export interface ManifiestoFilmcraft {
  nombre: string;
  /** Nombre del .otio y del .srt (el slug del proyecto). */
  base: string;
  otio: string;
  srt: string | null;
  medios: { nombre: string; bytes: number; existe: boolean }[];
}

/** Lo que la página manda a FilmCraft. `sustitutos`: los SVG ya pasados a PNG. */
export async function manifiestoFilmcraft(p: Proyecto, slug: string, dirProyecto: string, sustitutos: Record<string, string>): Promise<{ manifiesto: ManifiestoFilmcraft; medios: MedioFilmcraft[] }> {
  const { otio, medios } = otioParaFilmcraft(aOtio(p, path.resolve(dirProyecto), sustitutos));
  const tamanos = await Promise.all(medios.map((m) => fs.stat(m.abs).then((s) => s.size, () => -1)));
  const grupos = todosLosGrupos(p);
  return {
    manifiesto: {
      nombre: p.nombre,
      base: slug,
      otio: JSON.stringify(otio, null, 2),
      srt: grupos.length ? aSrt(grupos, duracionEscenas(p)) : null,
      medios: medios.map((m, i) => ({ nombre: m.nombre, bytes: Math.max(0, tamanos[i]!), existe: tamanos[i]! >= 0 })),
    },
    medios,
  };
}

/** Nombre seguro para guardar en `editor/` lo que manda FilmCraft (sin rutas ni caracteres raros). */
export function nombreGuardado(nombre: string): string {
  const limpio = path.basename(nombre.replaceAll("\\", "/")).replace(/[^\p{L}\p{N}._ -]/gu, "_").replace(/^\.+/, "").slice(0, 150);
  return limpio || "filmcraft";
}
