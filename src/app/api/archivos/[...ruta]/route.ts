import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { dentroDe } from "@/lib/archivos";
import { dirDatos } from "@/lib/rutas";

export const dynamic = "force-dynamic";

const TIPOS: Record<string, string> = {
  ".mp4": "video/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".png": "image/png", ".json": "application/json", ".log": "text/plain; charset=utf-8",
  ".webp": "image/webp", ".csv": "text/csv; charset=utf-8",
};

/** Sirve archivos de ~/geeper-data (con Range para los videos). Sólo lectura, sin salir de la carpeta. */
export async function GET(req: Request, ctx: { params: Promise<{ ruta: string[] }> }) {
  const { ruta } = await ctx.params;
  let abs: string;
  try {
    abs = dentroDe(dirDatos(), ruta.map(decodeURIComponent).join("/"));
  } catch {
    return new Response("Ruta inválida", { status: 400 });
  }
  if (abs.endsWith(".db") || abs.includes(`${path.sep}.`)) return new Response("No", { status: 403 });
  let st;
  try {
    st = await fs.stat(abs);
  } catch {
    return new Response("No existe", { status: 404 });
  }
  if (!st.isFile()) return new Response("No es un archivo", { status: 400 });
  const tipo = TIPOS[path.extname(abs).toLowerCase()] ?? "application/octet-stream";
  const descarga = new URL(req.url).searchParams.has("descargar");
  const cab: Record<string, string> = { "content-type": tipo, "accept-ranges": "bytes", "cache-control": "no-cache" };
  if (descarga) cab["content-disposition"] = `attachment; filename="${encodeURIComponent(path.basename(abs))}"`;
  const rango = req.headers.get("range");
  const m = rango ? /^bytes=(\d*)-(\d*)$/.exec(rango) : null;
  if (m && (m[1] || m[2])) {
    let ini = m[1] ? Number(m[1]) : st.size - Number(m[2]);
    let fin = m[1] && m[2] ? Number(m[2]) : st.size - 1;
    ini = Math.max(0, ini);
    fin = Math.min(st.size - 1, fin);
    if (ini > fin) return new Response(null, { status: 416, headers: { "content-range": `bytes */${st.size}` } });
    const flujo = Readable.toWeb(createReadStream(abs, { start: ini, end: fin })) as ReadableStream;
    return new Response(flujo, { status: 206, headers: { ...cab, "content-range": `bytes ${ini}-${fin}/${st.size}`, "content-length": String(fin - ini + 1) } });
  }
  const flujo = Readable.toWeb(createReadStream(abs)) as ReadableStream;
  return new Response(flujo, { headers: { ...cab, "content-length": String(st.size) } });
}
