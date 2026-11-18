/**
 * Esquema de geeper.json (schemaVersion 1): la fuente de verdad de cada proyecto.
 *
 * Toma los conceptos de OpenTimelineIO:
 *  - `pistas` (tracks) con `clips` en orden, cada uno con su `rango` sobre el asset (source_range),
 *  - `marcadores` (markers) sobre la línea de tiempo.
 * Y agrega lo de Geeper: cada asset lleva su `source` (archivo | mpt | tts | wan), su licencia y lo
 * necesario para regenerarlo; cada escena guarda lo que se oye, los tiempos por palabra y las
 * correcciones de lo que se muestra.
 *
 * Orden de la línea de tiempo: el de los clips de la pista `voz`. La pista `visual` tiene un clip por
 * escena, en el mismo orden (lo comprueba `validarProyecto`). La tarjeta final va después de la última
 * escena y dura lo que diga la plantilla.
 */
import { z } from "zod";

export const SCHEMA_VERSION = 1 as const;

export const Formato = z.enum(["9:16", "16:9", "1:1"]);
export type Formato = z.infer<typeof Formato>;

export const Source = z.enum(["archivo", "mpt", "tts", "wan"]);
export type Source = z.infer<typeof Source>;

const Segundos = z.number().finite().min(0);

/** Rango sobre el asset (source_range de OTIO), en segundos. */
export const Rango = z.object({ inicio: Segundos, duracion: z.number().finite().positive() });
export type Rango = z.infer<typeof Rango>;

export const Asset = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  tipo: z.enum(["video", "audio", "imagen"]),
  /** Relativa a la carpeta del proyecto (p. ej. assets/clip-01.mp4). */
  ruta: z.string().min(1).refine((r) => !r.startsWith("/") && !r.split("/").includes(".."), "ruta relativa sin '..'"),
  /** sha256 del archivo. */
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  source: Source,
  licencia: z.string().min(1),
  duracion: Segundos.optional(),
  ancho: z.number().int().positive().optional(),
  alto: z.number().int().positive().optional(),
  /** Lo necesario para regenerarlo: prompt, semilla, modelo, tarea de MPT, voz, texto... */
  regenerar: z.record(z.string(), z.unknown()).default({}),
});
export type Asset = z.infer<typeof Asset>;

export const Clip = z.object({
  id: z.string().min(1),
  asset: z.string().min(1),
  rango: Rango,
  /** Escena a la que pertenece (pistas visual y voz). */
  escena: z.string().optional(),
  /** Sólo video: cómo llena el cuadro si la relación de aspecto no coincide. */
  ajuste: z.enum(["cubrir", "contener"]).optional(),
  /** Sólo video: qué parte se conserva al recortar (object-position). */
  ancla: z.enum(["centro", "arriba", "abajo"]).optional(),
  /** Sólo audio: ganancia lineal. */
  volumen: z.number().min(0).max(4).optional(),
});
export type Clip = z.infer<typeof Clip>;

export const Pista = z.object({
  id: z.enum(["visual", "voz", "musica"]),
  tipo: z.enum(["video", "audio"]),
  clips: z.array(Clip),
});
export type Pista = z.infer<typeof Pista>;

/** Tiempo por palabra, en el tiempo del asset de voz de la escena. */
export const Palabra = z.object({ texto: z.string().min(1), inicio: Segundos, fin: Segundos });
export type Palabra = z.infer<typeof Palabra>;

/**
 * Corrección de lo que se muestra sobre las palabras oídas [desde, hasta) de la escena.
 * No cambia lo que se oye: redistribuye los tiempos de esas palabras entre el texto nuevo.
 */
export const Correccion = z.object({
  desde: z.number().int().min(0),
  hasta: z.number().int().positive(),
  texto: z.string(),
});
export type Correccion = z.infer<typeof Correccion>;

export const Escena = z.object({
  id: z.string().min(1),
  /** Lo que se oye en esta escena (fragmento del guion). */
  texto: z.string(),
  palabras: z.array(Palabra),
  correcciones: z.array(Correccion).default([]),
});
export type Escena = z.infer<typeof Escena>;

/** «GTA seis=GTA VI»: cambia lo que se lee sin cambiar lo que se oye (--mostrar de mpt-acabado). */
export const Mostrar = z.object({ de: z.string().min(1), a: z.string().min(1) });
export type Mostrar = z.infer<typeof Mostrar>;

export const Marcador = z.object({
  id: z.string(),
  tiempo: Segundos,
  nombre: z.string(),
  tipo: z.enum(["corte", "nota", "pulso"]),
});

export const Voz = z.object({
  motor: z.enum(["kokoro", "mpt"]),
  voz: z.string().min(1),
  velocidad: z.number().min(0.5).max(2).default(1),
  idioma: z.string().default("es"),
});
export type Voz = z.infer<typeof Voz>;

export const Proyecto = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: z.string().min(1),
    nombre: z.string().min(1),
    tema: z.string(),
    formato: Formato,
    plantilla: z.string().min(1),
    fps: z.literal(30),
    voz: Voz,
    guion: z.object({ texto: z.string() }),
    mostrar: z.array(Mostrar).default([]),
    assets: z.record(z.string(), Asset),
    pistas: z.array(Pista),
    escenas: z.record(z.string(), Escena),
    marcadores: z.array(Marcador).default([]),
    origen: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((p, ctx) => {
    for (const e of erroresDeConsistencia(p)) ctx.addIssue({ code: "custom", message: e });
  });
export type Proyecto = z.infer<typeof Proyecto>;

export function pista(p: Pick<Proyecto, "pistas">, id: Pista["id"]): Pista {
  const encontrada = p.pistas.find((x) => x.id === id);
  if (!encontrada) throw new Error(`Falta la pista ${id}`);
  return encontrada;
}

/** Reglas que Zod no expresa por campo: referencias, orden de escenas y rangos. */
export function erroresDeConsistencia(p: Omit<Proyecto, never>): string[] {
  const errores: string[] = [];
  const ids = p.pistas.map((x) => x.id);
  for (const requerida of ["visual", "voz"] as const) {
    if (!ids.includes(requerida)) errores.push(`Falta la pista «${requerida}»`);
  }
  if (new Set(ids).size !== ids.length) errores.push("Hay pistas repetidas");
  const visual = p.pistas.find((x) => x.id === "visual");
  const voz = p.pistas.find((x) => x.id === "voz");
  const clipIds = new Set<string>();
  for (const pi of p.pistas) {
    for (const c of pi.clips) {
      if (clipIds.has(c.id)) errores.push(`Clip repetido: ${c.id}`);
      clipIds.add(c.id);
      const a = p.assets[c.asset];
      if (!a) {
        errores.push(`El clip ${c.id} apunta a un asset que no existe: ${c.asset}`);
        continue;
      }
      if (pi.tipo === "video" && a.tipo === "audio") errores.push(`El clip ${c.id} es de video pero su asset es audio`);
      if (pi.tipo === "audio" && a.tipo !== "audio") errores.push(`El clip ${c.id} es de audio pero su asset no`);
      if (pi.id === "voz" && a.duracion !== undefined && c.rango.inicio + c.rango.duracion > a.duracion + 0.05) {
        errores.push(`El clip ${c.id} se sale del asset (${(c.rango.inicio + c.rango.duracion).toFixed(2)} s > ${a.duracion.toFixed(2)} s)`);
      }
    }
  }
  if (visual && voz) {
    const ev = visual.clips.map((c) => c.escena);
    const ea = voz.clips.map((c) => c.escena);
    if (JSON.stringify(ev) !== JSON.stringify(ea)) {
      errores.push("Las pistas visual y voz deben tener un clip por escena, en el mismo orden");
    }
    const vistas = new Set<string>();
    for (const e of ea) {
      if (!e || !p.escenas[e]) errores.push(`Clip de voz sin escena válida: ${String(e)}`);
      else if (vistas.has(e)) errores.push(`Escena usada dos veces: ${e}`);
      else vistas.add(e);
    }
    for (const id of Object.keys(p.escenas)) {
      if (!vistas.has(id)) errores.push(`La escena ${id} no está en la línea de tiempo`);
    }
  }
  for (const e of Object.values(p.escenas)) {
    for (const c of e.correcciones) {
      if (c.hasta <= c.desde || c.hasta > e.palabras.length) {
        errores.push(`Corrección fuera de rango en ${e.id}: [${c.desde}, ${c.hasta})`);
      }
    }
  }
  return errores;
}

export function validarProyecto(datos: unknown): Proyecto {
  return Proyecto.parse(datos);
}
