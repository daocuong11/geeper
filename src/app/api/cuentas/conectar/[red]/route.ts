import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { configurada, rutaRedes } from "@/lib/redes/config";
import { esIdRed, obtenerRed } from "@/lib/redes/index";
import { privadosBloquean } from "@/lib/redes/privados";
import { challenge, COOKIE_OAUTH, DURACION_OAUTH_MS, nuevoEstado, sellar } from "@/lib/redes/oauth";
import { verificarSalida } from "@/lib/redes/salida";
import { tapar } from "@/lib/redes/secretos";

export const dynamic = "force-dynamic";

function volver(req: NextRequest, error: string) {
  const u = new URL("/cuentas", req.url);
  u.searchParams.set("error", tapar(error).slice(0, 500));
  return NextResponse.redirect(u, 302);
}

/**
 * Arranca el OAuth: guarda state y code_verifier en una cookie firmada y manda a la pantalla oficial
 * de la red. `?cuenta=ID` reconecta una cuenta existente (la red igual pide elegir cuenta).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ red: string }> }) {
  const { red: idRed } = await ctx.params;
  try {
    if (!esIdRed(idRed)) return volver(req, `Red desconocida: ${idRed}`);
    const red = obtenerRed(idRed);
    if (privadosBloquean()) return volver(req, "Tus datos de acceso no están protegidos. Pulsa «Protegerlos ahora» en esta página y vuelve a intentarlo.");
    if (!configurada(idRed)) return volver(req, `Faltan las credenciales de ${red.nombre} en ${rutaRedes()}`);
    const vpn = await verificarSalida();
    if (!vpn.ok) return volver(req, `No se conecta con el VPN en este estado: ${vpn.detalle}`);

    const cuentaId = req.nextUrl.searchParams.get("cuenta") || undefined;
    if (cuentaId) {
      const c = await db.cuenta.findUnique({ where: { id: cuentaId }, select: { red: true } });
      if (!c || c.red !== idRed) return volver(req, "La cuenta a reconectar no existe o es de otra red");
    }

    const estado = nuevoEstado(idRed, cuentaId);
    const destino = red.urlConexion(estado.state, red.pkce ? challenge(estado.verifier, red.formatoChallenge) : "");
    const res = NextResponse.redirect(destino, 302);
    res.cookies.set(COOKIE_OAUTH, sellar(estado), {
      httpOnly: true,
      sameSite: "lax",
      path: "/api/cuentas",
      maxAge: Math.round(DURACION_OAUTH_MS / 1000),
      secure: req.nextUrl.protocol === "https:",
    });
    return res;
  } catch (e) {
    return volver(req, e instanceof Error ? e.message : String(e));
  }
}
