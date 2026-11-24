import { z } from "zod";
import { json, manejar } from "@/lib/http";
import { APPS, importarApps, resumenApps } from "@/lib/redes/credenciales";

export const dynamic = "force-dynamic";

const Pedido = z.object({ archivo: z.string().max(100_000), contrasena: z.string().min(1).max(200) }).strict();

/** Importa el archivo del equipo con su contraseña. */
export async function POST(req: Request) {
  return manejar(async () => {
    const { archivo, contrasena } = Pedido.parse(JSON.parse((await req.text()) || "{}"));
    const redes = importarApps(archivo, contrasena);
    return json({ importadas: redes.map((r) => APPS[r].nombre), apps: resumenApps() });
  });
}
