import { ZodError } from "zod";

export function json(datos: unknown, status = 200) {
  return Response.json(datos, { status });
}

/** Convierte errores en respuestas legibles para la UI. */
export async function manejar(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ZodError) return json({ error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, 400);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 400);
  }
}
