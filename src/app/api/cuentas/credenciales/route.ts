import { z } from "zod";
import { json, manejar } from "@/lib/http";
import { borrarApp, guardarApp, resumenApps } from "@/lib/redes/credenciales";
import { REDES_IDS } from "@/lib/redes/tipos";

export const dynamic = "force-dynamic";

/** Las apps de OAuth de cada red: si están cargadas, el final del ID y cómo crearlas. Nunca un secreto. */
export async function GET() {
  return manejar(async () => json({ apps: resumenApps() }));
}

const Guardar = z.object({ red: z.enum(REDES_IDS as [string, ...string[]]), datos: z.record(z.string(), z.union([z.string().max(500), z.boolean()])) }).strict();

/** Guarda las credenciales de una red. */
export async function PUT(req: Request) {
  return manejar(async () => {
    const { red, datos } = Guardar.parse(JSON.parse((await req.text()) || "{}"));
    guardarApp(red as (typeof REDES_IDS)[number], datos);
    return json({ apps: resumenApps() });
  });
}

/** Quita las credenciales de una red (las cuentas ya conectadas no se tocan). */
export async function DELETE(req: Request) {
  return manejar(async () => {
    const red = z.enum(REDES_IDS as [string, ...string[]]).parse(new URL(req.url).searchParams.get("red"));
    borrarApp(red as (typeof REDES_IDS)[number]);
    return json({ apps: resumenApps() });
  });
}
