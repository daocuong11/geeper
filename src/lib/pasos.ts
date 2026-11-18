/**
 * Pasos idempotentes con manifiesto.
 *
 * Cada paso calcula `input_hash` = sha256(nombre + hash de cada archivo de entrada + parámetros +
 * huella del motor). Si ya existe manifiestos/<paso>-<hash>.json y sus salidas siguen en disco con el
 * mismo hash, el paso se salta. Si no, escribe cada salida en un temporal y la publica con un rename
 * atómico; el manifiesto se escribe al final, así un paso cortado a la mitad nunca parece terminado.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { escribirAtomico, existe, jsonEstable, rutaTemporal, sha256Archivo, sha256Texto } from "./archivos";
import type { Registro } from "./proceso";

export interface Entradas {
  archivos: string[];
  params: unknown;
  /** Versión del motor (ffmpeg, Hyperframes, código del paso...). */
  motor: string;
}

export interface Manifiesto<T> {
  paso: string;
  input_hash: string;
  salidas: { ruta: string; hash: string }[];
  resultado: T;
  creado: string;
  segundos: number;
}

export interface Contexto {
  /** Carpeta del proyecto: las rutas del manifiesto son relativas a ella. */
  dir: string;
  log: Registro;
}

export async function calcularInputHash(ctx: Contexto, nombre: string, e: Entradas): Promise<string> {
  const archivos = [];
  for (const a of e.archivos) archivos.push({ ruta: path.relative(ctx.dir, a), hash: await sha256Archivo(a) });
  return sha256Texto(jsonEstable({ nombre, archivos, params: e.params ?? null, motor: e.motor }));
}

export function rutaManifiesto(ctx: Contexto, nombre: string, hash: string): string {
  return path.join(ctx.dir, "manifiestos", `${nombre.replace(/[^a-z0-9.-]/gi, "_")}-${hash.slice(0, 16)}.json`);
}

async function vigente<T>(ctx: Contexto, ruta: string): Promise<Manifiesto<T> | null> {
  if (!(await existe(ruta))) return null;
  const m = JSON.parse(await fs.readFile(ruta, "utf8")) as Manifiesto<T>;
  for (const s of m.salidas) {
    const abs = path.join(ctx.dir, s.ruta);
    if (!(await existe(abs)) || (await sha256Archivo(abs)) !== s.hash) return null;
  }
  return m;
}

/**
 * Corre `fn` sólo si hace falta. `fn` recibe una ruta temporal por cada salida y debe escribir ahí.
 */
export async function paso<T>(
  ctx: Contexto,
  nombre: string,
  entradas: Entradas,
  salidas: string[],
  fn: (temporales: string[], inputHash: string) => Promise<T>,
): Promise<{ saltado: boolean; resultado: T; inputHash: string }> {
  const inputHash = await calcularInputHash(ctx, nombre, entradas);
  const rm = rutaManifiesto(ctx, nombre, inputHash);
  const previo = await vigente<T>(ctx, rm);
  if (previo) {
    ctx.log(`· ${nombre}: ya hecho (${inputHash.slice(0, 12)}), se salta`);
    return { saltado: true, resultado: previo.resultado, inputHash };
  }
  ctx.log(`▶ ${nombre} (${inputHash.slice(0, 12)})`);
  const t0 = Date.now();
  const temporales = salidas.map(rutaTemporal);
  for (const s of salidas) await fs.mkdir(path.dirname(s), { recursive: true });
  try {
    const resultado = await fn(temporales, inputHash);
    for (let i = 0; i < salidas.length; i++) await fs.rename(temporales[i]!, salidas[i]!);
    const m: Manifiesto<T> = {
      paso: nombre,
      input_hash: inputHash,
      salidas: await Promise.all(salidas.map(async (s) => ({ ruta: path.relative(ctx.dir, s), hash: await sha256Archivo(s) }))),
      resultado,
      creado: new Date().toISOString(),
      segundos: (Date.now() - t0) / 1000,
    };
    await escribirAtomico(rm, JSON.stringify(m, null, 2));
    ctx.log(`✓ ${nombre} en ${m.segundos.toFixed(1)} s`);
    return { saltado: false, resultado, inputHash };
  } finally {
    for (const t of temporales) await fs.rm(t, { force: true, recursive: true });
  }
}
