import { createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { COMFYUI_DIR, leerCatalogo } from "@/lib/comfyui";
import { resolverArchivo } from "@/lib/hub-comfy";

export const dynamic = "force-dynamic";

const TIPOS: Record<string, string> = { ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".flac": "audio/flac" };

/** Miniaturas y ejemplos de las plantillas (sólo archivos del catálogo instalado, nunca rutas libres). */
export async function GET(_: Request, ctx: { params: Promise<{ nombre: string }> }) {
  const { nombre } = await ctx.params;
  const n = decodeURIComponent(nombre);
  const tipo = TIPOS[path.extname(n).toLowerCase()];
  if (!tipo) return new Response("No", { status: 403 });
  try {
    const guardada = (await leerCatalogo()).archivos[n];
    if (!guardada) return new Response("No existe", { status: 404 });
    const ruta = await resolverArchivo(COMFYUI_DIR, guardada);
    return new Response(Readable.toWeb(createReadStream(ruta)) as ReadableStream, { headers: { "content-type": tipo, "cache-control": "public, max-age=86400" } });
  } catch {
    return new Response("No existe", { status: 404 });
  }
}
