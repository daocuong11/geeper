import { randomBytes } from "node:crypto";
import { z } from "zod";
import { encolar } from "@/lib/cola";
import { db } from "@/lib/db";
import { json, manejar } from "@/lib/http";
import { MAX_DESCRIPCION, leerPropuesta, vozInstalada } from "@/lib/voces";

export const dynamic = "force-dynamic";

/** Encola el diseño de una voz desde una descripción: deja 3 tomas para elegir. */
export async function POST(req: Request) {
  return manejar(async () => {
    const { descripcion } = z.object({ descripcion: z.string().trim().min(8, "Describe la voz con un poco más de detalle").max(MAX_DESCRIPCION) }).parse(await req.json());
    if (!vozInstalada()) throw new Error("Las voces diseñadas no están instaladas en esta computadora.");
    const propuesta = randomBytes(6).toString("hex");
    const t = await encolar(null, "voz.disenar", { propuesta, descripcion });
    return json({ propuesta, trabajo: t.id }, 201);
  });
}

/** Avance de un diseño: estado del trabajo y, al terminar, las tomas. */
export async function GET(req: Request) {
  return manejar(async () => {
    const u = new URL(req.url);
    const propuesta = u.searchParams.get("propuesta") ?? "";
    const trabajo = u.searchParams.get("trabajo") ?? "";
    const t = await db.trabajo.findUnique({ where: { id: trabajo } });
    if (!t || t.tipo !== "voz.disenar") throw new Error("No existe ese diseño de voz");
    const p = t.estado === "hecho" ? await leerPropuesta(propuesta) : null;
    return json({ estado: t.estado, etapa: t.etapa, error: t.error, tomas: p?.tomas ?? [] });
  });
}
