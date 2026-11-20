/**
 * El siguiente paso de una campaña, en lenguaje simple y con una sola acción (claude-ads `/ads next`:
 * «el bloqueo más importante»). Sirve para que alguien sin experiencia sepa siempre qué hacer.
 */
import type { DatosCampana } from "./esquema";
import type { Chequeo, Revision } from "./revision";

export type Destino = "brief" | "conceptos" | "revision" | "prueba" | "exportar";

export interface Paso {
  /** 1–6: en qué etapa va (para la barra de avance). */
  etapa: number;
  titulo: string;
  detalle: string;
  boton: string;
  ir: Destino;
  concepto?: string;
  /** Acción del servidor que el botón puede correr directo. */
  accion?: "ideas";
  listo?: boolean;
}

export const ETAPAS = ["Tu negocio", "Ideas", "Videos", "Revisión", "Prueba", "Lanzar"] as const;

const pendiente = (c: Chequeo) => c.estado === "fail" || c.estado === "unknown";

export function siguientePaso(d: DatosCampana, r: Revision, estado: string): Paso {
  const b = d.brief;
  const faltaBrief = [!b.producto.trim() && "qué vendes", !b.oferta.trim() && "qué ofreces", !b.ubicaciones.length && "dónde se va a ver"].filter(Boolean);
  if (faltaBrief.length) {
    return { etapa: 1, titulo: "Cuéntanos de tu negocio", detalle: `Falta ${faltaBrief.join(", ")}. Con eso se arman las ideas y la revisión.`, boton: "Completar", ir: "brief" };
  }
  if (!d.conceptos.length) {
    return { etapa: 2, titulo: "Crea tus primeras ideas de anuncio", detalle: "Una idea es un video con su propio comienzo y su mensaje. Pide 3 borradores al asistente o escribe la tuya.", boton: "Propónme ideas", ir: "conceptos", accion: "ideas" };
  }
  const sinGuion = d.conceptos.find((c) => c.guion.trim().length < 20);
  if (sinGuion) {
    return { etapa: 2, titulo: `Escribe lo que dice «${sinGuion.nombre}»`, detalle: "El guion es lo que va a decir la voz, de principio a fin.", boton: "Escribir guion", ir: "conceptos", concepto: sinGuion.id };
  }
  if (d.conceptos.length === 1) {
    return { etapa: 2, titulo: "Agrega una segunda idea para comparar", detalle: "Con dos ideas distintas puedes probar cuál funciona mejor. Que no sea la misma frase con otras palabras.", boton: "Propónme ideas", ir: "conceptos", accion: "ideas" };
  }
  const sinVideo = d.conceptos.find((c) => !c.proyectoId);
  if (sinVideo) {
    return { etapa: 3, titulo: `Haz el video de «${sinVideo.nombre}»`, detalle: "Geeper lo genera con tu guion (tarda unos 3 minutos y usa la tarjeta de video).", boton: "Ir al video", ir: "conceptos", concepto: sinVideo.id };
  }
  const trabajando = r.conceptos.find((c) => c.proyecto?.ocupado);
  if (trabajando) {
    return { etapa: 3, titulo: `Se está haciendo el video de «${trabajando.nombre}»`, detalle: "Puedes seguir con otra cosa: esta página se actualiza sola cuando termine.", boton: "Ver la revisión", ir: "revision", concepto: trabajando.conceptoId };
  }
  // Primero lo que falla y Geeper puede arreglar o la persona puede cambiar; luego lo que hay que verificar.
  for (const c of r.conceptos) {
    const todos = [...c.copy, ...c.video, ...c.ubicaciones.flatMap((u) => u.chequeos)];
    const falla = todos.find((x) => x.estado === "fail");
    if (falla) {
      return { etapa: 4, titulo: `Arregla en «${c.nombre}»: ${falla.nombre.toLowerCase()}`, detalle: falla.accion ?? falla.evidencia, boton: "Ver qué hacer", ir: "revision", concepto: c.conceptoId };
    }
  }
  for (const c of r.conceptos) {
    const duda = [...c.copy, ...c.video].find((x) => x.estado === "unknown" && !x.clave);
    if (duda) return { etapa: 4, titulo: `Revisa en «${c.nombre}»: ${duda.nombre.toLowerCase()}`, detalle: duda.accion ?? duda.evidencia, boton: "Ver qué hacer", ir: "revision", concepto: c.conceptoId };
  }
  const manuales = r.conceptos.flatMap((c) => [...c.video, ...c.ubicaciones.flatMap((u) => u.chequeos)].filter((x) => x.clave && pendiente(x)));
  if (manuales.length) {
    return { etapa: 4, titulo: `Confirma ${manuales.length} cosa${manuales.length === 1 ? "" : "s"} en la plataforma de anuncios`, detalle: "Cuando subas el video a Google Ads, Meta o TikTok, mira la vista previa y los requisitos, y márcalos aquí. Geeper no puede verlos por ti.", boton: "Ver la lista", ir: "revision" };
  }
  const p = d.prueba;
  if (!p.control || !p.tratamientos.length) {
    return { etapa: 5, titulo: "Prepara la comparación", detalle: "Elige cuál idea es la base y cuál la compite, para saber cuál funciona mejor con datos y no a ojo.", boton: "Preparar", ir: "prueba" };
  }
  if (estado !== "activa" && estado !== "archivada") {
    return { etapa: 6, titulo: "Todo listo para lanzar", detalle: "Descarga el resumen, crea los anuncios en cada plataforma y marca la campaña como «Activa».", boton: "Descargar resumen", ir: "exportar", listo: true };
  }
  const sinDatos = [p.control, ...p.tratamientos].some((id) => id && !p.resultados[id]?.unidades);
  if (sinDatos) {
    return { etapa: 6, titulo: "Carga los resultados cuando termine la prueba", detalle: "Copia de la plataforma cuántas personas vieron cada anuncio y cuántas hicieron clic o compraron.", boton: "Cargar resultados", ir: "prueba", listo: true };
  }
  return { etapa: 6, titulo: "Lee el resultado de la prueba", detalle: "Geeper te dice si una idea ganó de verdad o si todavía no se puede saber.", boton: "Ver resultado", ir: "prueba", listo: true };
}
