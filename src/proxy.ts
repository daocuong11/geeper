/**
 * Defensa contra pedidos de otros sitios (CSRF). La API de Geeper escucha en localhost sin cuentas de
 * usuario: cualquier página abierta en el navegador podría mandarle un POST (publicar, borrar, cambiar
 * las credenciales de las apps de las redes). Los navegadores marcan de dónde viene cada pedido con
 * `Sec-Fetch-Site` y `Origin`: los que cambian algo y vienen de otro sitio se rechazan. Los pedidos sin
 * esas cabeceras (scripts, la terminal, el worker) siguen pasando: no los manda un navegador.
 */
import { NextResponse, type NextRequest } from "next/server";

const SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);

export function proxy(req: NextRequest) {
  if (SEGUROS.has(req.method)) return NextResponse.next();
  const sitio = req.headers.get("sec-fetch-site");
  const origen = req.headers.get("origin");
  const ajeno = (sitio !== null && sitio !== "same-origin" && sitio !== "none") || (origen !== null && origen !== req.nextUrl.origin && !mismoHost(origen, req));
  if (ajeno) return NextResponse.json({ error: "Pedido rechazado: viene de otro sitio." }, { status: 403 });
  return NextResponse.next();
}

/** El navegador puede llamar a Geeper por 127.0.0.1 o por localhost: mismo puerto, mismo Geeper. */
function mismoHost(origen: string, req: NextRequest): boolean {
  try {
    const o = new URL(origen);
    const local = (h: string) => h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    return local(o.hostname) && local(req.nextUrl.hostname) && o.port === (req.headers.get("host")?.split(":")[1] ?? req.nextUrl.port);
  } catch {
    return false;
  }
}

export const config = { matcher: "/api/:path*" };
