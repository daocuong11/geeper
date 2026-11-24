import { z } from "zod";
import { json, manejar } from "@/lib/http";
import { CONTRASENA_MIN, exportarApps } from "@/lib/redes/credenciales";

export const dynamic = "force-dynamic";

const Pedido = z.object({ contrasena: z.string().min(CONTRASENA_MIN).max(200) }).strict();

/** Archivo cifrado con las credenciales, para que el equipo lo importe. POST: la contraseña no va en la URL. */
export async function POST(req: Request) {
  return manejar(async () => {
    const { contrasena } = Pedido.parse(JSON.parse((await req.text()) || "{}"));
    const fecha = new Date().toISOString().slice(0, 10);
    return new Response(exportarApps(contrasena), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="geeper-redes-${fecha}.geeper-redes"`,
        "cache-control": "no-store",
      },
    });
  });
}

export function GET() {
  return json({ error: "Usa POST con la contraseña." }, 405);
}
