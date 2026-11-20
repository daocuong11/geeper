import { json, manejar } from "@/lib/http";
import { buscarNovedades, leerCache } from "@/lib/novedades";

export const dynamic = "force-dynamic";

/**
 * Novedades de los repos integrados. Sin parámetros responde del caché (y lo renueva si tiene más de un
 * día, sin hacer esperar); con `?ahora=1` consulta ya.
 */
export async function GET(req: Request) {
  return manejar(async () => {
    if (new URL(req.url).searchParams.get("ahora")) return json(await buscarNovedades({ forzar: true }));
    const cache = await leerCache();
    if (cache) {
      void buscarNovedades().catch(() => {}); // renueva en segundo plano si está viejo
      return json(cache);
    }
    return json(await buscarNovedades());
  });
}
