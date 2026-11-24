import { db } from "@/lib/db";
import { json, manejar } from "@/lib/http";
import { configurada, urlCallback } from "@/lib/redes/config";
import { cuentaPublica } from "@/lib/redes/cuentas";
import { obtenerRed } from "@/lib/redes/index";
import { privadosBloquean } from "@/lib/redes/privados";
import { leerAjustes, verificarSalida } from "@/lib/redes/salida";
import { REDES_IDS } from "@/lib/redes/tipos";

export const dynamic = "force-dynamic";

/** Cuentas conectadas (sin tokens), redes disponibles, ajustes de VPN y su estado. */
export async function GET() {
  return manejar(async () => {
    const filas = await db.cuenta.findMany({
      orderBy: [{ red: "asc" }, { creado: "asc" }],
      include: {
        publicaciones: {
          orderBy: { creado: "desc" },
          take: 3,
          select: { id: true, estado: true, titulo: true, urlExterna: true, creado: true },
        },
      },
    });
    const cuentas = filas.map((c) => ({ ...cuentaPublica(c), publicaciones: c.publicaciones }));
    const redes = REDES_IDS.map((id) => {
      const r = obtenerRed(id);
      return { id, nombre: r.nombre, configurada: configurada(id), formatos: r.formatos, privacidades: r.privacidades, programar: r.programar, callback: urlCallback(id) };
    });
    const [ajustes, vpn] = await Promise.all([leerAjustes(), verificarSalida()]);
    // Con archivos secretos sin proteger, «configurada» da false: la UI explica el motivo real.
    return json({ cuentas, redes, ajustes, vpn, privadosBloquean: privadosBloquean() });
  });
}
