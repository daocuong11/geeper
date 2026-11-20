/** Operaciones de la sección Anuncios sobre la base y los proyectos de Geeper. */
import { leerProyecto, guardarProyecto } from "../almacen";
import { db } from "../db";
import { aplicarEdicion } from "../ediciones";
import { Formato, type Plataforma, type Proyecto } from "../esquema";
import { DatosPlantilla } from "../plantillas";
import { versionDeProyecto } from "../render";
import { crearProyecto } from "../servicios";
import { ubicacion } from "./catalogo";
import { DatosCampana, EstadoCampana, type Concepto } from "./esquema";
import { revisar, type InfoProyecto, type ReglaQcV } from "./revision";
import { crearVarianteDeGancho } from "./variantes";
import { ideasAPropuesta, pedirIdeas } from "./ideas";
import { aplicarPropuesta } from "./propuesta";

export async function leerCampana(id: string) {
  const fila = await db.campana.findUniqueOrThrow({ where: { id } });
  return { fila, datos: DatosCampana.parse(fila.datos) };
}

function sinteticosDe(p: Proyecto): string[] {
  const out = new Set<string>();
  for (const a of Object.values(p.assets)) {
    if (a.source === "wan") out.add("planos de video (Wan)");
    else if (a.source === "tts") out.add("voz sintética");
    else if (a.source === "mpt") out.add(a.tipo === "audio" ? "voz sintética (Kokoro)" : "imágenes (MPT)");
  }
  return [...out];
}

/** Lo que la revisión necesita de cada proyecto vinculado. Un proyecto borrado simplemente no aparece. */
export async function infoProyectos(ids: string[]): Promise<Record<string, InfoProyecto>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return {};
  const filas = await db.proyecto.findMany({
    where: { id: { in: unicos } },
    include: {
      renders: { orderBy: { creado: "desc" }, take: 5 },
      trabajos: { where: { estado: { in: ["pendiente", "corriendo"] } }, select: { id: true } },
    },
  });
  const slugs = [...new Set(filas.map((f) => f.plantilla))];
  const plantillas = await db.plantilla.findMany({ where: { slug: { in: slugs } } });
  const cta = new Map(plantillas.map((pl) => [pl.slug, DatosPlantilla.safeParse(pl.datos).data?.cta ?? ""]));
  const out: Record<string, InfoProyecto> = {};
  for (const f of filas) {
    let p: Proyecto | null = null;
    try {
      p = await leerProyecto(f.slug);
    } catch {
      p = null; // geeper.json ilegible: la revisión lo verá como «sin datos», no se adivina.
    }
    const render = f.renders.find((r) => r.versionNumero === f.versionActual) ?? null;
    const informe = render?.informeQc as { reglas?: ReglaQcV[] } | null | undefined;
    out[f.id] = {
      id: f.id,
      slug: f.slug,
      nombre: f.nombre,
      formato: Formato.catch("9:16").parse(f.formato),
      estado: f.estado,
      versionActual: f.versionActual,
      plataformas: p?.plataformas ?? [],
      comercial: p?.comercial ?? false,
      sinteticos: p ? sinteticosDe(p) : [],
      textosEnPantalla: p?.textos.map((t) => t.texto) ?? [],
      ctaPlantilla: cta.get(f.plantilla) ?? "",
      render: render ? { estado: render.estado, duracion: render.duracion, reglas: informe?.reglas ?? [] } : null,
      ocupado: f.trabajos.length > 0,
    };
  }
  return out;
}

export async function revisionDe(datos: DatosCampana) {
  const info = await infoProyectos(datos.conceptos.map((c) => c.proyectoId ?? ""));
  return revisar(datos, info);
}

export async function guardarDatos(id: string, cuerpo: { nombre?: string; estado?: string; datos?: unknown }) {
  const data: { nombre?: string; estado?: string; datos?: object } = {};
  if (cuerpo.nombre !== undefined) {
    const n = cuerpo.nombre.trim();
    if (!n || n.length > 120) throw new Error("El nombre debe tener entre 1 y 120 caracteres");
    data.nombre = n;
  }
  if (cuerpo.estado !== undefined) data.estado = EstadoCampana.parse(cuerpo.estado);
  if (cuerpo.datos !== undefined) data.datos = DatosCampana.parse(cuerpo.datos) as object;
  return db.campana.update({ where: { id }, data });
}

function concepto(datos: DatosCampana, conceptoId: string): Concepto {
  const c = datos.conceptos.find((x) => x.id === conceptoId);
  if (!c) throw new Error("No existe ese concepto");
  return c;
}

/**
 * Crea el proyecto del concepto: MPT dice el guion tal cual (video_script) con la plantilla del brief
 * y el formato de su ubicación principal. No genera dos veces: si ya tiene video, hay que desvincularlo.
 */
export async function generarVideo(campanaId: string, conceptoId: string) {
  const { fila, datos } = await leerCampana(campanaId);
  const c = concepto(datos, conceptoId);
  if (c.proyectoId && (await db.proyecto.findUnique({ where: { id: c.proyectoId } }))) {
    throw new Error("Este concepto ya tiene un video. Desvincúlalo antes de generar otro.");
  }
  const guion = c.guion.trim();
  if (guion.length < 20) throw new Error("Escribe el guion (lo que se dice) antes de generar el video");
  const plantilla = datos.brief.plantilla || (await db.plantilla.findFirst({ orderBy: { creado: "asc" } }))?.slug;
  if (!plantilla) throw new Error("No hay plantillas: crea una en Plantillas");
  const u = ubicacion(c.principal);
  const p = await crearProyecto({
    tema: c.gancho.trim() || c.nombre,
    nombre: `${fila.nombre} · ${c.nombre}`,
    formato: u?.formato ?? "9:16",
    plantilla,
    guion,
  });
  c.proyectoId = p.id;
  await db.campana.update({ where: { id: campanaId }, data: { datos: DatosCampana.parse(datos) as object } });
  return p;
}

export async function vincular(campanaId: string, conceptoId: string, proyectoId: string | null) {
  const { datos } = await leerCampana(campanaId);
  const c = concepto(datos, conceptoId);
  if (proyectoId && !(await db.proyecto.findUnique({ where: { id: proyectoId } }))) throw new Error("No existe ese proyecto");
  c.proyectoId = proyectoId;
  await db.campana.update({ where: { id: campanaId }, data: { datos: DatosCampana.parse(datos) as object } });
}

/**
 * Deja el proyecto listo para anuncio: uso comercial (el QC bloquea licencias dudosas) y las
 * plataformas de sus ubicaciones (el QC mide la banda de cada interfaz). Crea una versión nueva:
 * hay que volver a renderizar.
 */
export async function prepararProyecto(campanaId: string, conceptoId: string, formato?: Formato) {
  const { datos } = await leerCampana(campanaId);
  const c = concepto(datos, conceptoId);
  if (!c.proyectoId) throw new Error("El concepto no tiene video");
  const ids = c.ubicaciones.length ? c.ubicaciones : datos.brief.ubicaciones;
  const nuevas = ids.map((id) => ubicacion(id)?.plataforma).filter((x): x is Plataforma => Boolean(x));
  let { p } = await versionDeProyecto(c.proyectoId);
  const plataformas = [...new Set([...p.plataformas, ...nuevas])];
  const cambios: string[] = [];
  if (!p.comercial || plataformas.length !== p.plataformas.length) {
    p = aplicarEdicion(p, { tipo: "cambiarDestino", comercial: true, plataformas });
    cambios.push("uso comercial y plataformas del anuncio");
  }
  if (formato && formato !== p.formato) {
    p = aplicarEdicion(p, { tipo: "cambiarFormato", formato });
    cambios.push(`formato ${formato}`);
  }
  if (!cambios.length) return { version: null, cambios };
  const version = await guardarProyecto(c.proyectoId, p, `Preparado para anuncio: ${cambios.join(", ")}`);
  return { version, cambios };
}

/**
 * Variante de gancho de un concepto con video: crea el proyecto copia (voz nueva de la primera
 * escena + render, sin GPU) y un concepto nuevo vinculado a él. Si la prueba está vacía, la deja
 * armada: control = el original, tratamiento = la variante, variable = gancho.
 */
export async function varianteDeGancho(campanaId: string, conceptoId: string, gancho: string) {
  const { fila, datos } = await leerCampana(campanaId);
  const c = concepto(datos, conceptoId);
  if (!c.proyectoId) throw new Error("El concepto no tiene video del que partir");
  if (datos.conceptos.length >= 30) throw new Error("La campaña ya tiene 30 conceptos");
  const letra = String.fromCharCode(66 + datos.conceptos.filter((x) => x.nombre.startsWith(`${c.nombre} · gancho`)).length);
  const nombre = `${c.nombre} · gancho ${letra}`.slice(0, 80);
  const p = await crearVarianteDeGancho(c.proyectoId, gancho, `${fila.nombre} · ${nombre}`);
  const g = gancho.replace(/\s+/g, " ").trim();
  const nuevo: Concepto = {
    ...structuredClone(c),
    id: `c-${p.id.slice(-8)}`,
    nombre,
    gancho: g.slice(0, 200),
    guion: c.gancho && c.guion.includes(c.gancho) ? c.guion.replace(c.gancho, g) : c.guion,
    hipotesis: `Cambiar sólo el gancho («${c.gancho || "original"}» → «${g}») cambia la métrica primaria.`.slice(0, 400),
    proyectoId: p.id,
  };
  datos.conceptos.push(nuevo);
  if (!datos.prueba.control && !datos.prueba.tratamientos.length) {
    datos.prueba.control = c.id;
    datos.prueba.tratamientos = [nuevo.id];
    datos.prueba.variable = "gancho";
  }
  await db.campana.update({ where: { id: campanaId }, data: { datos: DatosCampana.parse(datos) as object } });
  return { proyecto: { id: p.id }, concepto: nuevo.id };
}

/** «Propónme ideas»: borradores del LLM local que entran como conceptos nuevos (sin video). */
export async function proponerIdeas(campanaId: string) {
  const { datos } = await leerCampana(campanaId);
  if (!datos.brief.producto.trim() && !datos.brief.oferta.trim()) throw new Error("Primero cuéntanos qué vendes y qué ofreces (Brief): las ideas salen de ahí.");
  if (datos.conceptos.length >= 27) throw new Error("La campaña ya tiene casi 30 ideas: borra algunas antes de pedir más.");
  const crudo = await pedirIdeas(datos);
  const { datos: nuevos, cambios } = aplicarPropuesta(datos, ideasAPropuesta(datos, crudo));
  await db.campana.update({ where: { id: campanaId }, data: { datos: nuevos as object } });
  return { nuevas: nuevos.conceptos.slice(datos.conceptos.length).map((c) => c.id), cambios };
}
