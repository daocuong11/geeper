/**
 * «Color y portada» de una plantilla de canal, para personas sin conocimientos técnicos: muestras de cada
 * look de color y de cada estilo de portada sobre una imagen real del canal, y subir un diseño PSD propio
 * (se revisa y se explica qué capas tiene). Ver docs/PHOTOCRAFT.md.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { existe, sha256Archivo, sha256Texto } from "./archivos";
import { db } from "./db";
import type { Formato } from "./esquema";
import { LOOKS, muestraLook, type IdLook } from "./looks";
import { ffmpeg } from "./media";
import { componer, leerCapas, PREFIJO_VARIABLE, variablesDe, type Capa } from "./photocraft";
import { DatosPlantilla, obtenerPlantilla } from "./plantillas";
import { ESTILOS_PORTADA, imagenesPorEscena, plantillaBase, type EstiloPortada } from "./portada";
import { versionDeProyecto } from "./render";
import { dirDatos, dirProyecto, PHOTOCRAFT_VERSION } from "./rutas";

const dirMuestras = (slug: string) => path.join(dirDatos(), "portadas", "muestras", slug);

/** Imagen de muestra: una escena de un proyecto reciente del canal, o un degradado si aún no hay. */
async function imagenDeMuestra(slug: string): Promise<string> {
  const dir = dirMuestras(slug);
  await fs.mkdir(dir, { recursive: true });
  const proyectos = await db.proyecto.findMany({ where: { plantilla: slug, versionActual: { gte: 1 } }, orderBy: { creado: "desc" }, take: 5 });
  for (const f of proyectos) {
    try {
      const { p } = await versionDeProyecto(f.id);
      const imgs = imagenesPorEscena(p);
      const c = imgs[Math.min(1, imgs.length - 1)];
      if (!c) continue;
      const salida = path.join(dir, `fuente-${f.slug}-${c.escena}.png`);
      if (!(await existe(salida))) {
        const origen = path.join(dirProyecto(f.slug), c.ruta);
        await ffmpeg(["-v", "error", ...(c.tipo === "video" ? ["-ss", c.segundo.toFixed(3)] : []), "-i", origen, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", salida]);
      }
      return salida;
    } catch {
      /* prueba con el siguiente */
    }
  }
  const salida = path.join(dir, "fuente-degradado.png");
  if (!(await existe(salida))) {
    await ffmpeg(["-v", "error", "-f", "lavfi", "-i", "gradients=s=1280x720:c0=0xd9a066:c1=0x2a6f97:c2=0x3b7d4f:x0=0:y0=0:x1=1280:y1=720:n=3", "-frames:v", "1", salida]);
  }
  return salida;
}

export interface Muestras {
  looks: { id: IdLook; nombre: string; descripcion: string; imagen: string }[];
  estilos: { id: EstiloPortada; nombre: string; descripcion: string; imagen: string }[];
}

/** Muestras de looks (con su intensidad) y de estilos de portada, en caché por datos. Rutas relativas a datos. */
export async function muestrasDe(slug: string, intensidad: number): Promise<Muestras> {
  const { datos } = await obtenerPlantilla(slug);
  const fuente = await imagenDeMuestra(slug);
  const dir = dirMuestras(slug);
  const huella = (await sha256Archivo(fuente)).slice(0, 10);
  const rel = (abs: string) => path.relative(dirDatos(), abs);

  const looks: Muestras["looks"] = [];
  for (const [id, l] of Object.entries(LOOKS) as [IdLook, (typeof LOOKS)[IdLook]][]) {
    const salida = path.join(dir, `look-${id}-${Math.round(intensidad * 100)}-${huella}.jpg`);
    if (!(await existe(salida))) await muestraLook(fuente, { look: id, intensidad, mejora: false }, salida);
    looks.push({ id, ...l, imagen: rel(salida) });
  }

  const estilos: Muestras["estilos"] = [];
  const formato: Formato = "16:9";
  for (const [id, e] of Object.entries(ESTILOS_PORTADA) as [EstiloPortada, (typeof ESTILOS_PORTADA)[EstiloPortada]][]) {
    const clave = sha256Texto(JSON.stringify({ PHOTOCRAFT_VERSION, id, c: datos.colores, t: datos.tipografia, m: datos.marca.texto, huella })).slice(0, 12);
    const salida = path.join(dir, `estilo-${id}-${clave}.jpg`);
    if (!(await existe(salida))) {
      const plantilla = await plantillaBase(slug, formato, datos, id);
      await componer({ plantilla, valores: { titulo: "Así se verá el título de tu video", imagen: fuente, marca: datos.marca.texto }, salida, calidad: 80 });
    }
    estilos.push({ id, ...e, imagen: rel(salida) });
  }
  return { looks, estilos };
}

/** Cambia sólo el color y el estilo de portada, partiendo de los datos frescos de la base. */
export async function guardarApariencia(slug: string, cambio: { color?: Partial<DatosPlantilla["color"]>; estilo?: EstiloPortada }): Promise<DatosPlantilla> {
  const { datos } = await obtenerPlantilla(slug);
  const nuevo = DatosPlantilla.parse({
    ...datos,
    color: { ...datos.color, ...cambio.color },
    portada: { ...datos.portada, ...(cambio.estilo ? { estilo: cambio.estilo } : {}) },
  });
  await db.plantilla.update({ where: { slug }, data: { datos: nuevo } });
  return nuevo;
}

/** El formato que mejor encaja con un ancho × alto (función pura). */
export function formatoDe(ancho: number, alto: number): Formato {
  const r = ancho / alto;
  const cerca = ([["16:9", 16 / 9], ["9:16", 9 / 16], ["1:1", 1]] as const).map(([f, x]) => [f, Math.abs(Math.log(r / x))] as const).sort((a, b) => a[1] - b[1]);
  return cerca[0]![0];
}

const NOMBRES: Record<string, string> = { titulo: "el título", imagen: "la imagen del video", marca: "la marca del canal" };

/** Explica en palabras simples qué encontró en el diseño (función pura). */
export function revisarDiseno(capas: Capa[]): { ok: boolean; encontradas: string[]; faltan: string[]; extra: string[]; problemas: string[] } {
  const problemas: string[] = [];
  let vars = new Map<string, Capa>();
  try {
    vars = variablesDe(capas);
  } catch (e) {
    problemas.push(e instanceof Error ? e.message : String(e));
  }
  const encontradas: string[] = [];
  const extra: string[] = [];
  for (const [n, c] of vars) {
    if (n === "titulo" || n === "marca") {
      if (c.clase !== "Type") problemas.push(`La capa «${PREFIJO_VARIABLE}${n}» tiene que ser una capa de texto.`);
      else encontradas.push(NOMBRES[n]!);
    } else if (n === "imagen") {
      if (c.clase !== "Pixel" && c.clase !== "Smart Object") problemas.push(`La capa «${PREFIJO_VARIABLE}imagen» tiene que ser una imagen (capa normal u objeto inteligente).`);
      else encontradas.push(NOMBRES[n]!);
    } else extra.push(`${PREFIJO_VARIABLE}${n}`);
  }
  const faltan = ["titulo", "imagen", "marca"].filter((n) => !vars.has(n)).map((n) => `${NOMBRES[n]} (capa «${PREFIJO_VARIABLE}${n}»)`);
  const ok = problemas.length === 0 && (vars.has("titulo") || vars.has("imagen"));
  if (!vars.has("titulo") && !vars.has("imagen") && !problemas.length) {
    problemas.push(`No encontramos capas para llenar. En tu programa de diseño, ponle nombre «${PREFIJO_VARIABLE}titulo» a la capa del título y «${PREFIJO_VARIABLE}imagen» a la de la foto.`);
  }
  return { ok, encontradas, faltan, extra, problemas };
}

/** Guarda un diseño PSD propio para el formato que le corresponda y devuelve la revisión y una muestra. */
export async function subirDiseno(slug: string, nombre: string, contenido: Buffer): Promise<{ formato: Formato; revision: ReturnType<typeof revisarDiseno>; muestra: string | null }> {
  if (!/\.(psd|psb|pcraft)$/i.test(nombre)) throw new Error("El diseño tiene que ser un archivo .psd (Photoshop o Photopea).");
  if (contenido.length > 300 * 1024 * 1024) throw new Error("El archivo pesa más de 300 MB: guárdalo más liviano (sin capas que no se usan).");
  const dir = path.join(dirDatos(), "portadas", "propias");
  await fs.mkdir(dir, { recursive: true });
  const ext = path.extname(nombre).toLowerCase();
  const tmp = path.join(dir, `.subida-${process.pid}-${Date.now()}${ext}`);
  await fs.writeFile(tmp, contenido);
  try {
    let info;
    try {
      info = await leerCapas(tmp);
    } catch {
      throw new Error("No se pudo abrir el archivo. ¿Es un .psd válido? Prueba guardarlo otra vez desde tu programa de diseño.");
    }
    const revision = revisarDiseno(info.capas);
    const formato = formatoDe(info.ancho, info.alto);
    if (!revision.ok) return { formato, revision, muestra: null };
    const hash = sha256Texto(contenido.toString("base64")).slice(0, 12);
    const destino = path.join(dir, `${slug}-${formato.replace(":", "x")}-${hash}${ext}`);
    await fs.rename(tmp, destino);
    const { datos } = await obtenerPlantilla(slug);
    const nuevo = DatosPlantilla.parse({ ...datos, portada: { ...datos.portada, plantillas: { ...datos.portada.plantillas, [formato]: destino } } });
    await db.plantilla.update({ where: { slug }, data: { datos: nuevo } });
    const fuente = await imagenDeMuestra(slug);
    const muestra = path.join(dirMuestras(slug), `propia-${formato.replace(":", "x")}-${hash}.jpg`);
    await componer({ plantilla: destino, valores: { titulo: "Así se verá el título de tu video", imagen: fuente, marca: datos.marca.texto }, salida: muestra, calidad: 80 });
    return { formato, revision, muestra: path.relative(dirDatos(), muestra) };
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

/** Quita el diseño propio de un formato (vuelve a los estilos listos). */
export async function quitarDiseno(slug: string, formato: Formato): Promise<void> {
  const { datos } = await obtenerPlantilla(slug);
  const plantillas = { ...datos.portada.plantillas };
  delete plantillas[formato];
  await db.plantilla.update({ where: { slug }, data: { datos: DatosPlantilla.parse({ ...datos, portada: { ...datos.portada, plantillas } }) } });
}
