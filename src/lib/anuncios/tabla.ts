/**
 * Tabla de variantes de un concepto: una fila = un video nuevo, copia del original con otro gancho,
 * otro texto en pantalla, otra imagen de inicio u otro botón final. Idea de la combinación de datos de
 * DesignCraft (docs/agents.md §Data merge): la plantilla no se toca y cada registro da un documento.
 * Aquí está lo puro (leer lo pegado desde Excel o un CSV, validar); crear los videos está en servicio.ts.
 */
import { z } from "zod";

export const MAX_FILAS = 10;

export const FilaVariante = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  gancho: z.string().max(300).default(""),
  texto: z.string().max(160).default(""),
  /** Ruta relativa a ~/geeper-data (anuncios/<campaña>/…), subida desde la tabla. */
  imagen: z.string().max(300).default(""),
  cta: z.string().max(60).default(""),
  /** Concepto creado a partir de esta fila (null = todavía no). */
  concepto: z.string().nullable().default(null),
  /** Por qué no se pudo crear la última vez. */
  error: z.string().max(400).default(""),
});
export type FilaVariante = z.infer<typeof FilaVariante>;

export type CampoTabla = "gancho" | "texto" | "cta";

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Nombres de columna que se reconocen (en minúsculas, sin tildes). */
const ENCABEZADOS: Record<string, CampoTabla> = {
  gancho: "gancho", hook: "gancho", "primera frase": "gancho", "lo que dice": "gancho", "frase inicial": "gancho",
  texto: "texto", "texto en pantalla": "texto", titulo: "texto", rotulo: "texto", "on screen": "texto",
  cta: "cta", boton: "cta", "boton final": "cta", "llamado a la accion": "cta", llamado: "cta",
};

/** Separa una línea de CSV respetando comillas ("a, b" es un solo valor; "" es una comilla). */
function celdas(linea: string, sep: string): string[] {
  const out: string[] = [];
  let actual = "";
  let comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i]!;
    if (comillas) {
      if (ch === '"' && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else if (ch === '"') comillas = false;
      else actual += ch;
    } else if (ch === '"' && !actual.trim()) comillas = true;
    else if (ch === sep) {
      out.push(actual.trim());
      actual = "";
    } else actual += ch;
  }
  out.push(actual.trim());
  return out;
}

/** Une las líneas que quedaron partidas dentro de unas comillas (un salto de línea dentro de una celda). */
function registros(texto: string): string[] {
  const out: string[] = [];
  let actual = "";
  for (const l of texto.replace(/^﻿/, "").split(/\r?\n/)) {
    actual = actual ? `${actual}\n${l}` : l;
    if ((actual.match(/"/g)?.length ?? 0) % 2 === 0) {
      out.push(actual);
      actual = "";
    }
  }
  if (actual) out.push(actual);
  return out.filter((l) => l.trim());
}

/**
 * Lee lo pegado desde una hoja de cálculo (separado por tabuladores) o un CSV (coma o punto y coma).
 * Con encabezados reconocibles («gancho», «texto en pantalla», «botón»…) usa esas columnas; si no,
 * toma las columnas en orden: gancho, texto, botón. Devuelve las filas y avisos legibles.
 */
export function leerTabla(texto: string): { filas: Pick<FilaVariante, CampoTabla>[]; avisos: string[] } {
  const lineas = registros(texto);
  const avisos: string[] = [];
  if (!lineas.length) return { filas: [], avisos: ["No hay nada que leer"] };
  const primera = lineas[0]!;
  const sep = primera.includes("\t") ? "\t" : (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ";" : ",";
  // Si dos columnas dicen lo mismo («Gancho», «gancho»), vale la primera.
  const cabeza = celdas(primera, sep).map((c) => ENCABEZADOS[norm(c)]).map((c, i, todas) => (c && todas.indexOf(c) === i ? c : undefined));
  const conCabeza = cabeza.some(Boolean);
  const columnas: (CampoTabla | undefined)[] = conCabeza ? cabeza : ["gancho", "texto", "cta"];
  if (conCabeza) {
    const ignoradas = celdas(primera, sep).filter((_, i) => !cabeza[i]);
    if (ignoradas.length) avisos.push(`Columnas que no se usan: ${ignoradas.join(", ")}`);
  }
  const filas: Pick<FilaVariante, CampoTabla>[] = [];
  for (const l of conCabeza ? lineas.slice(1) : lineas) {
    const fila = { gancho: "", texto: "", cta: "" };
    celdas(l, sep).forEach((v, i) => {
      const campo = columnas[i];
      if (campo) fila[campo] = v.replace(/\s+/g, " ").trim();
    });
    if (fila.gancho || fila.texto || fila.cta) filas.push(fila);
  }
  if (filas.length > MAX_FILAS) avisos.push(`Sólo se toman las primeras ${MAX_FILAS} filas (hay ${filas.length}).`);
  return { filas: filas.slice(0, MAX_FILAS), avisos };
}

/** Qué tiene mal una fila, en palabras simples (vacío = está bien). */
export function problemasDeFila(f: Pick<FilaVariante, CampoTabla | "imagen">): string[] {
  const out: string[] = [];
  const gancho = f.gancho.trim();
  if (!gancho && !f.texto.trim() && !f.cta.trim() && !f.imagen) out.push("No cambia nada");
  if (gancho && gancho.length < 3) out.push("El gancho es muy corto");
  if (gancho.length > 300) out.push("El gancho pasa de 300 caracteres");
  if (f.texto.trim().length > 160) out.push("El texto en pantalla pasa de 160 caracteres");
  if (f.cta.trim().length > 60) out.push("El botón pasa de 60 caracteres");
  return out;
}

/** La variable de la prueba A/B según lo que cambian las filas. */
export function variableDePrueba(filas: Pick<FilaVariante, CampoTabla | "imagen">[]): "gancho" | "cta" | "otra" {
  const cambia = (k: CampoTabla | "imagen") => filas.some((f) => f[k].trim());
  if (cambia("gancho") && !cambia("texto") && !cambia("cta") && !cambia("imagen")) return "gancho";
  if (cambia("cta") && !cambia("gancho") && !cambia("texto") && !cambia("imagen")) return "cta";
  return "otra";
}
