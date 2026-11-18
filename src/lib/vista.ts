/** Datos que la UI muestra de un proyecto (derivados de geeper.json + la base). */
import { db } from "./db";
import { validarProyecto, type Proyecto } from "./esquema";
import { caracteresPorLinea } from "./formatos";
import { escenasEnLinea, gruposDeEscena, todosLosGrupos } from "./linea";
import { obtenerPlantilla } from "./plantillas";
import { lineas } from "./subtitulos";

export async function vistaProyecto(id: string) {
  const fila = await db.proyecto.findUnique({
    where: { id },
    include: {
      versiones: { orderBy: { numero: "desc" }, select: { numero: true, nota: true, creado: true, hash: true } },
      renders: { orderBy: { creado: "desc" } },
      trabajos: { orderBy: { creado: "desc" }, take: 30 },
      lote: { select: { id: true, nombre: true } },
    },
  });
  if (!fila) return null;
  let p: Proyecto | null = null;
  if (fila.versionActual > 0) {
    const v = await db.version.findUniqueOrThrow({ where: { proyectoId_numero: { proyectoId: id, numero: fila.versionActual } } });
    p = validarProyecto(JSON.parse(v.json));
  }
  let escenas: unknown[] = [];
  let total = 0;
  if (p) {
    const proyecto = p;
    const plantilla = await obtenerPlantilla(proyecto.plantilla).catch(() => null);
    const cpl = caracteresPorLinea(proyecto.formato);
    const es = escenasEnLinea(proyecto);
    const todos = todosLosGrupos(proyecto);
    total = es.reduce((s, e) => s + e.duracion, 0) + (plantilla?.datos.tarjetaFinal.duracion ?? 0);
    escenas = es.map((e) => {
      const a = proyecto.assets[e.visual.asset]!;
      const vozA = proyecto.assets[e.voz.asset]!;
      return {
        id: e.escena.id,
        indice: e.indice,
        inicio: e.inicio,
        duracion: e.duracion,
        texto: e.escena.texto,
        palabras: e.escena.palabras.map((w) => w.texto),
        correcciones: e.escena.correcciones,
        visual: { asset: a.id, ruta: a.ruta, source: a.source, licencia: a.licencia, tipo: a.tipo, inicio: e.visual.rango.inicio, ajuste: e.visual.ajuste ?? "auto", ancla: e.visual.ancla ?? "centro", prompt: a.regenerar.prompt ?? null },
        voz: { asset: vozA.id, source: vozA.source, ruta: vozA.ruta, inicio: e.voz.rango.inicio },
        grupos: gruposDeEscena(proyecto, e, todos).map((g) => {
          // Si el grupo cruza al corte siguiente, aquí se edita la parte de esta escena.
          const propias = g.fichas.filter((f) => f.escena === e.escena.id);
          const desde = Math.min(...propias.map((f) => f.origen[0]));
          const hasta = Math.max(...propias.map((f) => f.origen[1]));
          return {
            texto: g.texto,
            inicio: g.inicio,
            fin: g.fin,
            desde,
            hasta,
            oido: e.escena.palabras.slice(desde, hasta).map((w) => w.texto).join(" "),
            lineas: lineas(g.texto, cpl).length,
            cruza: propias.length < g.fichas.length,
            mostradoPropio: propias.map((f) => f.texto).join(" "),
          };
        }),
      };
    });
  }
  return { fila, p, escenas, total };
}
