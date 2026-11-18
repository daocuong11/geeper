/** Leer y guardar proyectos: geeper.json en disco + una Version por guardado + índice de assets. */
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "./db";
import { escribirAtomico, sha256Archivo, sha256Texto } from "./archivos";
import { validarProyecto, type Asset, type Proyecto } from "./esquema";
import { probar } from "./media";
import { dirProyecto } from "./rutas";

export function rutaGeeperJson(slug: string): string {
  return path.join(dirProyecto(slug), "geeper.json");
}

export async function crearCarpetas(slug: string): Promise<string> {
  const dir = dirProyecto(slug);
  for (const sub of ["assets", "renders", "manifiestos", "logs", "build"]) {
    await fs.mkdir(path.join(dir, sub), { recursive: true });
  }
  return dir;
}

export async function leerProyecto(slug: string): Promise<Proyecto | null> {
  try {
    return validarProyecto(JSON.parse(await fs.readFile(rutaGeeperJson(slug), "utf8")));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

/** Valida, guarda geeper.json (atómico) y crea la Version siguiente. Devuelve el número. */
export async function guardarProyecto(proyectoId: string, datos: Proyecto, nota: string): Promise<number> {
  const p = validarProyecto(datos);
  const fila = await db.proyecto.findUniqueOrThrow({ where: { id: proyectoId } });
  const json = JSON.stringify(p, null, 2) + "\n";
  const numero = await db.$transaction(async (tx) => {
    const ultima = await tx.version.findFirst({ where: { proyectoId }, orderBy: { numero: "desc" } });
    const n = (ultima?.numero ?? 0) + 1;
    await tx.version.create({ data: { proyectoId, numero: n, nota, hash: sha256Texto(json), json } });
    await tx.proyecto.update({
      where: { id: proyectoId },
      data: { versionActual: n, formato: p.formato, plantilla: p.plantilla, nombre: p.nombre },
    });
    return n;
  });
  await escribirAtomico(rutaGeeperJson(fila.slug), json);
  return numero;
}

export async function registrarAssetsEnDb(proyectoId: string, p: Proyecto): Promise<void> {
  for (const a of Object.values(p.assets)) {
    const r = a.regenerar;
    const datos = {
      proyectoId,
      tipo: a.tipo,
      ruta: a.ruta,
      hash: a.hash,
      source: a.source,
      prompt: typeof r.prompt === "string" ? r.prompt : null,
      semilla: typeof r.semilla === "number" ? r.semilla : null,
      modelo: typeof r.modelo === "string" ? r.modelo : null,
      licencia: a.licencia,
      procedencia: r as object,
    };
    await db.asset.upsert({ where: { id: a.id }, create: { id: a.id, ...datos }, update: datos });
  }
}

/** Describe un archivo ya copiado dentro del proyecto como Asset de geeper.json. */
export async function describirAsset(
  dirProy: string,
  ruta: string,
  base: Pick<Asset, "id" | "tipo" | "source" | "licencia"> & { regenerar?: Record<string, unknown> },
): Promise<Asset> {
  const abs = path.join(dirProy, ruta);
  const info = await probar(abs).catch(() => ({ duracion: undefined, ancho: undefined, alto: undefined }));
  return {
    ...base,
    ruta,
    hash: await sha256Archivo(abs),
    duracion: info.duracion || undefined,
    ancho: info.ancho,
    alto: info.alto,
    regenerar: base.regenerar ?? {},
  };
}
