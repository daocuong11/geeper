/**
 * Paso «escenas.animar» de un video nuevo con estilo «Equilibrado» o «Máxima calidad»
 * (estilos-generacion.ts): después de importar lo de MPT (y de que el avatar entre en sus escenas), cada
 * escena que sigue siendo la imagen de MPT pasa a un plano de video con plano.ts, con el prompt del estilo.
 * Las que ya rehízo el avatar no se tocan. Una escena que falla queda como estaba (se reintenta desde el
 * editor) y no tumba el video.
 *
 * El estilo elegido en «Nuevo» se guarda en la carpeta del proyecto (`generacion.json`), porque la cadena
 * de trabajos sólo lleva los pasos que faltan.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { guardarProyecto } from "./almacen";
import { EstiloGeneracion, ESTILOS_GENERACION } from "./estilos-generacion";
import type { Proyecto } from "./esquema";
import { escenasEnLinea } from "./linea";
import { generarPlanoEscena, planearPlano, type ContextoPlano } from "./plano";
import { versionDeProyecto } from "./render";
import { dirProyecto } from "./rutas";
import { animarDe, estiloVideoDe, promptSetup, SetupVideo } from "./setup-video";

/** Lo que se eligió en «Nuevo»: el preset y, si se personalizó, su setup. */
const Generacion = z.object({ estilo: EstiloGeneracion, setup: SetupVideo.optional() });
export type Generacion = z.infer<typeof Generacion>;
const rutaGeneracion = (slug: string) => path.join(dirProyecto(slug), "generacion.json");

export async function guardarEstiloGeneracion(slug: string, estilo: EstiloGeneracion, setup?: SetupVideo) {
  await fs.mkdir(dirProyecto(slug), { recursive: true });
  await fs.writeFile(rutaGeneracion(slug), JSON.stringify(Generacion.parse({ estilo, setup }), null, 2));
}

/** El setup guardado; los proyectos de antes (sólo el preset) usan el setup de su preset. */
export async function leerEstiloGeneracion(slug: string): Promise<{ estilo: EstiloGeneracion; setup: SetupVideo; personalizado: boolean } | null> {
  const g = await fs.readFile(rutaGeneracion(slug), "utf8").then((t) => Generacion.parse(JSON.parse(t)), () => null);
  if (!g) return null;
  return { estilo: g.estilo, setup: g.setup ?? ESTILOS_GENERACION[g.estilo].setup, personalizado: !!g.setup };
}

/** Escenas que siguen con la imagen de MPT (las que el avatar ya rehízo, no). Función pura. */
export function escenasParaAnimar(p: Proyecto): { escena: string; numero: number }[] {
  return escenasEnLinea(p)
    .filter((e) => p.assets[e.visual.asset]?.source === "mpt")
    .map((e) => ({ escena: e.escena.id, numero: e.indice + 1 }));
}

/** El proyecto con el acabado (grano, viñeta) del setup, sin duplicar ni borrar otros efectos. Función pura. */
export function conEstiloVideo(p: Proyecto, estilo: EstiloGeneracion | SetupVideo): Proyecto | null {
  const e = estiloVideoDe(typeof estilo === "string" ? ESTILOS_GENERACION[estilo].setup : estilo);
  if (!e?.efectos?.length) return null;
  const previos = (p.estilo?.efectos ?? []).filter((x) => !e.efectos!.some((y) => y.tipo === x.tipo));
  return { ...p, estilo: { ...p.estilo, efectos: [...previos, ...e.efectos] } };
}

export interface AvanceEscenas {
  numero: number;
  indice: number;
  total: number;
}

/** Anima las escenas del video con el setup guardado y le suma su acabado. Devuelve las que quedaron animadas. */
export async function animarEscenasDelVideo(ctx: ContextoPlano, proyectoId: string, slug: string, alEmpezar: (a: AvanceEscenas) => void | Promise<void>): Promise<{ estilo: EstiloGeneracion | null; hechas: number[] }> {
  const g = await leerEstiloGeneracion(slug);
  if (!g) return { estilo: null, hechas: [] };
  const nombre = g.personalizado ? `${ESTILOS_GENERACION[g.estilo].nombre}, personalizado` : ESTILOS_GENERACION[g.estilo].nombre;
  let { p } = await versionDeProyecto(proyectoId);
  const conAcabado = conEstiloVideo(p, g.setup);
  if (conAcabado) {
    await guardarProyecto(proyectoId, conAcabado, `Setup «${nombre}»: acabado del video`);
    ({ p } = await versionDeProyecto(proyectoId));
  }
  const animar = animarDe(g.setup);
  if (!animar) return { estilo: g.estilo, hechas: [] };
  const lista = escenasParaAnimar(p);
  const hechas: number[] = [];
  for (const [i, x] of lista.entries()) {
    await alEmpezar({ numero: x.numero, indice: i, total: lista.length });
    try {
      const base = planearPlano(p, x.escena, { modelo: animar.modelo }).promptBase;
      const { prompt, negativo } = promptSetup(g.setup, base);
      await generarPlanoEscena(ctx, proyectoId, p, x.escena, {
        modelo: animar.modelo, prompt, negativo, camara: animar.camara, extra: animar.extra, nota: `Escena ${x.numero} animada («${nombre}»)`,
      });
      hechas.push(x.numero);
      ({ p } = await versionDeProyecto(proyectoId));
    } catch (e) {
      if (ctx.signal?.aborted) throw e;
      ctx.log(`Escena ${x.numero}: no se pudo animar (${e instanceof Error ? e.message.split("\n")[0] : e}); queda como estaba.`);
    }
  }
  return { estilo: g.estilo, hechas };
}
