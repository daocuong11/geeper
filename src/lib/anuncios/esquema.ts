/** Datos de una campaña de anuncios (Campana.datos), validados con Zod. Ver docs/ANUNCIOS.md. */
import { z } from "zod";
import { FilaVariante, MAX_FILAS } from "./tabla";
import { BOTONES_CTA, CATEGORIAS_SENSIBLES, IDS_UBICACION, MARCOS, OBJETIVOS, UNIDADES_PRUEBA, VARIABLES_PRUEBA } from "./catalogo";

const claves = <T extends Record<string, unknown>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

export const ESTADOS_CAMPANA = ["borrador", "en-revision", "lista", "activa", "archivada"] as const;
export const EstadoCampana = z.enum(ESTADOS_CAMPANA);
export type EstadoCampana = z.infer<typeof EstadoCampana>;

export const IdUbicacion = z.enum(IDS_UBICACION);

export const ResultadoChequeo = z.enum(["pass", "fail", "unknown", "not_applicable"]);
export type ResultadoChequeo = z.infer<typeof ResultadoChequeo>;


const Id = z.string().regex(/^[a-z0-9-]{1,40}$/);
const Texto = (max: number) => z.string().max(max).default("");

/** Una afirmación que puede ir en el anuncio, con su prueba. Sólo las aprobadas cuentan como respaldo. */
export const Afirmacion = z.object({
  id: Id,
  texto: z.string().max(300),
  prueba: Texto(500),
  aprobada: z.boolean().default(false),
});
export type Afirmacion = z.infer<typeof Afirmacion>;

export const Brief = z.object({
  marca: Texto(120),
  producto: Texto(200),
  objetivo: z.enum(claves(OBJETIVOS)).default("trafico"),
  audiencia: Texto(1000),
  oferta: Texto(600),
  destino: z.union([z.literal(""), z.string().url().max(500)]).default(""),
  /** Botón de la red (lo que se elige en el administrador), aparte del CTA que se dice. */
  botonCta: z.enum(BOTONES_CTA).default("Más información"),
  ubicaciones: z.array(IdUbicacion).default(["youtube-shorts", "tiktok-infeed", "instagram-reels"]),
  categoria: z.enum(claves(CATEGORIAS_SENSIBLES)).default("ninguna"),
  plantilla: Texto(80),
  afirmaciones: z.array(Afirmacion).default([]),
  notas: Texto(2000),
});
export type Brief = z.infer<typeof Brief>;

export const Concepto = z.object({
  id: Id,
  nombre: z.string().min(1).max(80),
  marco: z.enum(claves(MARCOS)).default("ninguno"),
  insight: Texto(600),
  gancho: Texto(200),
  promesa: Texto(300),
  /** Ids de afirmaciones del brief que respaldan el concepto. */
  pruebas: z.array(Id).default([]),
  narrativa: Texto(1500),
  cta: Texto(120),
  objeciones: Texto(600),
  hipotesis: Texto(400),
  /** Lo que se dice: va tal cual a MPT (video_script) al generar el video. */
  guion: Texto(4000),
  /** Ubicación de la que sale el formato del video. */
  principal: IdUbicacion.default("youtube-shorts"),
  /** Vacío = todas las del brief. */
  ubicaciones: z.array(IdUbicacion).default([]),
  proyectoId: z.string().nullable().default(null),
});
export type Concepto = z.infer<typeof Concepto>;


/** Lo que la persona anotó en un chequeo manual. Clave: `<concepto>:<ubicación>:<chequeo>`. */
export const Manual = z.object({
  estado: ResultadoChequeo,
  evidencia: Texto(500),
  fecha: z.string().max(40).default(""),
});
export type Manual = z.infer<typeof Manual>;

export const Prueba = z.object({
  decision: Texto(400),
  hipotesis: Texto(400),
  variable: z.enum(claves(VARIABLES_PRUEBA)).default("gancho"),
  unidad: z.enum(claves(UNIDADES_PRUEBA)).default("usuario"),
  control: z.string().nullable().default(null),
  tratamientos: z.array(z.string()).default([]),
  metrica: Texto(120),
  guardarrailes: Texto(400),
  /** Tasa de la métrica en el control, en % (p. ej. 1,2 = 1,2 % de clics). */
  tasaBase: z.number().min(0).max(100).nullable().default(null),
  /** Efecto mínimo que vale la pena detectar, relativo, en % (p. ej. 20 = +20 %). */
  efectoMinimo: z.number().min(0).max(1000).nullable().default(null),
  alfa: z.number().min(0.001).max(0.2).default(0.05),
  potencia: z.number().min(0.5).max(0.99).default(0.8),
  /** Unidades por día que recibe cada variante (impresiones, visitas...). */
  volumenDiario: z.number().min(0).nullable().default(null),
  reglaParada: Texto(400),
  /** Lectura: unidades y conversiones por concepto (id), cargadas a mano desde el administrador. */
  resultados: z
    .record(z.string().max(40), z.object({ unidades: z.number().int().min(0).nullable().default(null), conversiones: z.number().int().min(0).nullable().default(null) }))
    .default({}),
  /** ¿Los guardarraíles se mantuvieron? Lo marca la persona. */
  guardarrailesOk: ResultadoChequeo.default("unknown"),
  inicio: z.string().max(40).default(""),
  fin: z.string().max(40).default(""),
});
export type Prueba = z.infer<typeof Prueba>;

export const DatosCampana = z
  .object({
    brief: Brief.default(Brief.parse({})),
    conceptos: z.array(Concepto).max(30).default([]),
    manuales: z.record(z.string().max(140), Manual).default({}),
    prueba: Prueba.default(Prueba.parse({})),
    /** Tabla de variantes por concepto (id del concepto → filas). Ver tabla.ts. */
    tablas: z.record(z.string().max(40), z.array(FilaVariante).max(MAX_FILAS)).default({}),
  })
  .superRefine((d, ctx) => {
    const ids = d.conceptos.map((c) => c.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Hay conceptos con el mismo id" });
    const afs = d.brief.afirmaciones.map((a) => a.id);
    if (new Set(afs).size !== afs.length) ctx.addIssue({ code: "custom", message: "Hay afirmaciones con el mismo id" });
  });
export type DatosCampana = z.infer<typeof DatosCampana>;

export function datosVacios(): DatosCampana {
  return DatosCampana.parse({});
}
