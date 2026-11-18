import fs from "node:fs/promises";
import { dentroDe } from "@/lib/archivos";
import { db } from "@/lib/db";
import { dirDatos } from "@/lib/rutas";

export const dynamic = "force-dynamic";

/** Últimas líneas del log de un trabajo. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const t = await db.trabajo.findUnique({ where: { id } });
  if (!t?.log) return new Response("(sin log todavía)", { headers: { "content-type": "text/plain; charset=utf-8" } });
  const lineas = Number(new URL(req.url).searchParams.get("lineas") ?? 200);
  try {
    const texto = await fs.readFile(dentroDe(dirDatos(), t.log), "utf8");
    return new Response(texto.split("\n").slice(-lineas).join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
  } catch {
    return new Response("(no se pudo leer el log)", { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
}
