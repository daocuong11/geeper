import { z } from "zod";
import { guardarProyecto, registrarAssetsEnDb } from "@/lib/almacen";
import { autoCaras, sinSeguirCaras } from "@/lib/caras";
import { db } from "@/lib/db";
import { metricas } from "@/lib/formatos";
import { json, manejar } from "@/lib/http";
import { escenasEnLinea, opcionesDe } from "@/lib/linea";
import { versionDeProyecto } from "@/lib/render";
import { dirProyecto } from "@/lib/rutas";

const Cuerpo = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("auto") }),
  z.object({ accion: z.literal("deshacer"), escenas: z.array(z.string()).min(1) }),
]);

/** Un análisis a la vez por proyecto (dos pestañas abiertas no lo corren dos veces). */
const enCurso = new Set<string>();

/**
 * Reencuadre por cara en proyectos viejos (BRECHAS.md E4).
 *  - `auto`: la UI lo pide al abrir un proyecto que nunca se analizó. Busca caras (CPU, ~1 s por clip),
 *    guarda una versión si algo cambia y devuelve qué escenas cambiaron, para avisarle a la persona.
 *  - `deshacer`: «Dejar como estaba»: esas escenas vuelven al encuadre de antes (una versión nueva).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    const { id } = await ctx.params;
    const cuerpo = Cuerpo.parse(await req.json());
    const fila = await db.proyecto.findUniqueOrThrow({ where: { id } });
    const { p } = await versionDeProyecto(id);
    if (cuerpo.accion === "deshacer") {
      const n = await guardarProyecto(id, sinSeguirCaras(p, cuerpo.escenas), "Encuadre como estaba (sin seguir caras)");
      return json({ version: n });
    }
    if (enCurso.has(id)) return json({ escenas: [], enCurso: true });
    enCurso.add(id);
    try {
      const { W, H } = metricas(p.formato, opcionesDe(p));
      const log = (l: string) => console.log(`[caras ${fila.slug}] ${l}`);
      const r = await autoCaras({ dir: dirProyecto(fila.slug), log }, p, W, H);
      if (!r) return json({ escenas: [] });
      // Se guarda aunque ninguna escena cambie de recorte: el foco queda para cuando se cambie de formato.
      const tocados = Object.values(r.p.assets).some((a) => a.foco && !p.assets[a.id]?.foco);
      let version: number | null = null;
      if (tocados) {
        version = await guardarProyecto(id, r.p, r.escenas.length ? `Encuadre automático: caras en ${r.escenas.length} escena(s)` : "Caras detectadas (sin cambios de encuadre)");
        await registrarAssetsEnDb(id, r.p);
      }
      const indice = new Map(escenasEnLinea(r.p).map((e) => [e.escena.id, e.indice + 1]));
      return json({ version, escenas: r.escenas.map((e) => ({ id: e, numero: indice.get(e) ?? 0 })) });
    } finally {
      enCurso.delete(id);
    }
  });
}
