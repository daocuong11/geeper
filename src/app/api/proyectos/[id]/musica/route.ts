import { guardarProyecto } from "@/lib/almacen";
import { db } from "@/lib/db";
import { aplicarEdicion } from "@/lib/ediciones";
import { json, manejar } from "@/lib/http";
import { proponerMusica } from "@/lib/pulsos";
import { versionDeProyecto } from "@/lib/render";
import { dirProyecto } from "@/lib/rutas";

/**
 * Alinea la música al ritmo: detecta sus pulsos (CPU, unos segundos) y elige desde qué segundo empieza
 * para que más cortes de escena caigan en un pulso. Si la pista tiene pulso, guarda una Version nueva con
 * el inicio elegido y los pulsos como marcadores; si no, no cambia nada.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    const { id } = await ctx.params;
    const fila = await db.proyecto.findUniqueOrThrow({ where: { id } });
    const { p } = await versionDeProyecto(id);
    const prop = await proponerMusica(p, dirProyecto(fila.slug));
    if (!prop) throw new Error("El proyecto no tiene música");
    if (!prop.despues) return json({ cambio: false, motivo: "La música no tiene un pulso estable: no hay a qué alinear los cortes.", ...prop });
    const igual = prop.antes && prop.despues.enPulso <= prop.antes.enPulso && prop.edicion.inicio === p.pistas.find((x) => x.id === "musica")?.clips[0]?.rango.inicio;
    const nuevo = aplicarEdicion(p, prop.edicion);
    const version = await guardarProyecto(id, nuevo, igual ? "Pulsos de la música" : "Música alineada al ritmo");
    return json({ cambio: true, version, ...prop });
  });
}
