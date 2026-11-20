/**
 * Vista previa en vivo: compila la versión actual de geeper.json a Hyperframes sin renderizar, para
 * reproducirla en el editor con <hyperframes-player>. Cuesta lo que la mezcla de audio (~0,5 s) más la
 * compilación; se reutiliza mientras no cambie la versión ni el compilador.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { compilar, escribirProyectoHf, VERSION_COMPILADOR } from "./compilador";
import { prepararColor } from "./looks";
import { db } from "./db";
import { metricas } from "./formatos";
import { duracionEscenas } from "./linea";
import { mezclar } from "./mezcla";
import { obtenerPlantilla } from "./plantillas";
import { versionDeProyecto } from "./render";
import { RAIZ_REPO, dirDatos, dirProyecto } from "./rutas";

/**
 * El player maneja la composición «en directo» (sólo la línea de GSAP) si ve `window.__timelines`, y
 * entonces no inyecta el runtime de Hyperframes, que es quien muestra y oculta cada clip según su
 * tiempo: sin él se veía siempre el último clip. Se enlaza una copia local del runtime de la misma
 * versión (sin CDN). Sólo en la vista previa: el HTML del render no cambia.
 */
const RUNTIME = path.join(RAIZ_REPO, "node_modules", "@hyperframes", "core", "dist", "hyperframe.runtime.iife.js");

export interface VistaPrevia {
  /** Ruta del index.html dentro de ~/geeper-data, para /api/archivos/<ruta>. */
  ruta: string;
  version: number;
  ancho: number;
  alto: number;
  duracion: number;
}

const enCurso = new Map<string, Promise<VistaPrevia>>();

export function prepararVistaPrevia(proyectoId: string): Promise<VistaPrevia> {
  // Una sola compilación a la vez por proyecto: dos pestañas no se pisan la carpeta.
  const previa = enCurso.get(proyectoId);
  if (previa) return previa;
  const p = preparar(proyectoId).finally(() => enCurso.delete(proyectoId));
  enCurso.set(proyectoId, p);
  return p;
}

async function preparar(proyectoId: string): Promise<VistaPrevia> {
  const fila = await db.proyecto.findUniqueOrThrow({ where: { id: proyectoId } });
  if (fila.versionActual < 1) throw new Error("El proyecto todavía no tiene geeper.json");
  const dir = dirProyecto(fila.slug);
  const { numero, p } = await versionDeProyecto(proyectoId);
  const plantilla = await obtenerPlantilla(p.plantilla);
  const m = metricas(p.formato);
  const total = duracionEscenas(p) + plantilla.datos.tarjetaFinal.duracion;
  const dirVista = path.join(dir, "build", `vista-${p.formato.replace(":", "x")}`);
  const sello = path.join(dirVista, "sello.json");
  const clave = JSON.stringify({ numero, compilador: VERSION_COMPILADOR, plantilla: plantilla.datos, runtime: 1 });
  const resultado: VistaPrevia = {
    ruta: path.relative(dirDatos(), path.join(dirVista, "index.html")),
    version: numero,
    ancho: m.W,
    alto: m.H,
    duracion: total,
  };
  try {
    if ((await fs.readFile(sello, "utf8")) === clave) return resultado;
  } catch {
    /* sin compilar todavía */
  }
  const rutaMezcla = path.join(dir, "build", "vista-mezcla.wav");
  await fs.mkdir(path.dirname(rutaMezcla), { recursive: true });
  await mezclar(p, dir, total, plantilla.datos.musica.ducking, rutaMezcla, () => {});
  const sustitutos = await prepararColor(p, dir, plantilla.datos.color);
  const comp = compilar(p, plantilla.datos, rutaMezcla, dir, sustitutos);
  await escribirProyectoHf(dirVista, { ...comp, html: comp.html.replace("</body>", '<script src="hyperframe.runtime.js"></script>\n</body>') });
  await fs.copyFile(RUNTIME, path.join(dirVista, "hyperframe.runtime.js"));
  await fs.writeFile(sello, clave);
  return resultado;
}
