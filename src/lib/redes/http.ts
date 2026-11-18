/** Utilidades HTTP comunes a los adaptadores: errores clasificados y lectura de tramos del archivo. */
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { tapar } from "./secretos";
import { ErrorRed } from "./tipos";

export const TIMEOUT_MS = 60_000;
/** Para subir un tramo grande por una conexión lenta. */
export const TIMEOUT_SUBIDA_MS = 15 * 60_000;

/**
 * Clasifica una respuesta no-OK. 401 → auth; 429 → cuota (espera `Retry-After` o 15 min);
 * el resto → red. `extra` permite que cada adaptador reconozca su error de cuota diaria.
 */
export async function errorDe(r: Response, contexto: string, extra?: (cuerpo: string) => ErrorRed | null): Promise<ErrorRed> {
  const cuerpo = await r.text().catch(() => "");
  const propio = extra?.(cuerpo);
  if (propio) return propio;
  const msg = tapar(`${contexto}: HTTP ${r.status} ${cuerpo.slice(0, 600)}`);
  if (r.status === 401) return new ErrorRed("auth", msg, undefined, 401);
  if (r.status === 429) {
    const ra = Number(r.headers.get("retry-after"));
    return new ErrorRed("cuota", msg, new Date(Date.now() + (Number.isFinite(ra) && ra > 0 ? ra * 1000 : 15 * 60_000)), 429);
  }
  return new ErrorRed("red", msg, undefined, r.status);
}

export async function pedir(url: string, init: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = TIMEOUT_MS, ...resto } = init;
  try {
    return await fetch(url, { ...resto, signal: resto.signal ?? AbortSignal.timeout(timeout) });
  } catch (e) {
    throw new ErrorRed("red", tapar(`No se pudo conectar con ${new URL(url).host}: ${e instanceof Error ? e.message : String(e)}`));
  }
}

/** fetch + JSON; si la respuesta no es OK lanza un ErrorRed clasificado. */
export async function pedirJson<T>(url: string, init: RequestInit & { timeout?: number } = {}, contexto = "Red", extra?: (cuerpo: string) => ErrorRed | null): Promise<T> {
  const r = await pedir(url, init);
  if (!r.ok) throw await errorDe(r, contexto, extra);
  return (await r.json()) as T;
}

export function formulario(datos: Record<string, string | undefined>): URLSearchParams {
  const f = new URLSearchParams();
  for (const [k, v] of Object.entries(datos)) if (v !== undefined) f.set(k, v);
  return f;
}

/**
 * Cuerpo de un tramo del archivo como stream (no carga el video entero en memoria).
 * Usar con `duplex: "half"` en fetch: `{ body: leerTramo(...), duplex: "half" }`.
 */
export function leerTramo(ruta: string, desde: number, hasta: number): ReadableStream<Uint8Array> {
  if (hasta <= desde) throw new Error(`Tramo vacío: ${desde}-${hasta}`);
  return Readable.toWeb(createReadStream(ruta, { start: desde, end: hasta - 1 })) as ReadableStream<Uint8Array>;
}
