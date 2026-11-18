import { z } from "zod";
import { json, manejar } from "@/lib/http";
import { guardarAjustes, juzgar, leerAjustes, salidaActual, verificarSalida, type AjustesRed } from "@/lib/redes/salida";

export const dynamic = "force-dynamic";

/** Mide la salida ahora. Con el VPN apagado, verificarSalida no mide: aquí se mide igual para mostrar la IP. */
async function medirAhora(a: AjustesRed) {
  return a.vpn === "apagado" ? juzgar(a, await salidaActual(true)) : verificarSalida(true);
}

/** Ajustes del VPN y la salida medida ahora (sin caché). */
export async function GET() {
  return manejar(async () => {
    const ajustes = await leerAjustes();
    return json({ ajustes, vpn: await medirAhora(ajustes) });
  });
}

const Ajustes = z.object({
  vpn: z.enum(["apagado", "requerido"]),
  ipEsperada: z.union([z.literal(""), z.ipv4(), z.ipv6()]),
  paisEsperado: z.string().trim().regex(/^([A-Za-z]{2})?$/, "código ISO de 2 letras (AR, MX, US…) o vacío"),
});

export async function PATCH(req: Request) {
  return manejar(async () => {
    const cuerpo = (await req.json()) as Record<string, unknown>;
    const a = Ajustes.parse({ ...cuerpo, ipEsperada: typeof cuerpo.ipEsperada === "string" ? cuerpo.ipEsperada.trim() : cuerpo.ipEsperada });
    const ajustes = await guardarAjustes(a);
    return json({ ajustes, vpn: await medirAhora(ajustes) });
  });
}
