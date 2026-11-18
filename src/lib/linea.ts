/** Línea de tiempo derivada de geeper.json: la posición de cada escena sale del orden, no se guarda. */
import { pista, type Clip, type Escena, type Proyecto } from "./esquema";
import { caracteresPorLinea } from "./formatos";
import { agrupar, aplicarCorrecciones, lineas, reemplazar, type Ficha } from "./subtitulos";

export interface EscenaEnLinea {
  indice: number;
  escena: Escena;
  voz: Clip;
  visual: Clip;
  /** Inicio y duración en la línea de tiempo final. */
  inicio: number;
  duracion: number;
}

export interface Grupo {
  /** Palabras mostradas, en tiempo de la línea final. */
  fichas: (Ficha & { escena: string })[];
  texto: string;
  inicio: number;
  fin: number;
  escena: string;
}

/** Silencio al inicio (s): la imagen ya se ve y el primer subtítulo tiene de dónde anticiparse. */
export const ENTRADA = 0.3;

export function escenasEnLinea(p: Proyecto): EscenaEnLinea[] {
  const voz = pista(p, "voz").clips;
  const visual = pista(p, "visual").clips;
  let t = ENTRADA;
  return voz.map((c, i) => {
    const escena = p.escenas[c.escena ?? ""];
    const v = visual[i];
    if (!escena || !v) throw new Error(`Escena inconsistente en la posición ${i}`);
    const r = { indice: i, escena, voz: c, visual: v, inicio: t, duracion: c.rango.duracion };
    t += c.rango.duracion;
    return r;
  });
}

export function duracionEscenas(p: Proyecto): number {
  return ENTRADA + pista(p, "voz").clips.reduce((s, c) => s + c.rango.duracion, 0);
}

/** Palabras mostradas de una escena, ya en tiempo de la línea final. */
function fichasDeEscena(p: Proyecto, e: EscenaEnLinea): (Ficha & { escena: string })[] {
  const desde = e.voz.rango.inicio;
  const hasta = desde + e.voz.rango.duracion;
  const desplazamiento = e.inicio - desde;
  return reemplazar(aplicarCorrecciones(e.escena.palabras, e.escena.correcciones), p.mostrar)
    // Sólo lo que suena dentro del rango del clip de voz (recortado al borde).
    .filter((f) => f.fin > desde + 0.01 && f.inicio < hasta - 0.01)
    .map((f) => ({
      ...f,
      inicio: Math.max(desde, f.inicio) + desplazamiento,
      fin: Math.min(hasta, f.fin) + desplazamiento,
      escena: e.escena.id,
    }));
}

/**
 * Grupos de subtítulos de todo el video: se agrupa por escena (como mpt_acabado) y después se
 * suaviza el ritmo en toda la línea, así un grupo puede cruzar un corte si eso lo hace legible.
 */
export function todosLosGrupos(p: Proyecto): Grupo[] {
  const cpl = caracteresPorLinea(p.formato);
  const escenas = escenasEnLinea(p);
  const porEscena = escenas.flatMap((e) => agrupar(fichasDeEscena(p, e)).flatMap((g) => partirEnDosLineas(g, cpl)));
  const fin = ENTRADA + escenas.reduce((s, e) => s + e.duracion, 0);
  return suavizarRitmo(porEscena, cpl, fin).map((g) => ({
    fichas: g,
    texto: g.map((f) => f.texto).join(" "),
    inicio: g[0]!.inicio,
    fin: g[g.length - 1]!.fin,
    escena: g[0]!.escena,
  }));
}

/** Grupos que empiezan en una escena (para editarlos en la UI). */
export function gruposDeEscena(p: Proyecto, e: EscenaEnLinea, todos = todosLosGrupos(p)): Grupo[] {
  return todos.filter((g) => g.escena === e.escena.id);
}

/** Si un grupo no cabe en 2 líneas del formato, lo parte por la mitad (en palabras) hasta que quepa. */
export function partirEnDosLineas<T extends Ficha>(g: T[], cpl: number): T[][] {
  const texto = g.map((f) => f.texto).join(" ");
  if (g.length <= 1 || lineas(texto, cpl).length <= 2) return [g];
  const m = Math.ceil(g.length / 2);
  return [...partirEnDosLineas(g.slice(0, m), cpl), ...partirEnDosLineas(g.slice(m), cpl)];
}

export const MAX_CPS = 17;

const textoDe = (g: Ficha[]) => g.map((f) => f.texto).join(" ");

export const ANTICIPO = 0.3;
export const PERMANENCIA = 0.6;

/**
 * Cuándo se ve cada grupo: aparece hasta 0,3 s antes de su primera palabra si hay silencio antes y
 * se queda hasta 0,6 s después de la última, sin pisar al siguiente. Lo usan el compilador, el QC y
 * el suavizado, así lo medido es exactamente lo que se ve.
 */
export function intervalos(grupos: { inicio: number; fin: number }[], finSubs: number): { ini: number; fin: number }[] {
  const ini = grupos.map((g, i) => {
    const previo = grupos[i - 1];
    const base = g.inicio - 0.04;
    // Anticipo sólo sobre silencio: nunca antes de que termine de sonar el grupo anterior.
    const anticipado = Math.max(g.inicio - ANTICIPO, Math.min(previo ? previo.fin : 0, base));
    return Math.max(0, Math.min(base, anticipado));
  });
  return grupos.map((g, i) => {
    const siguiente = ini[i + 1];
    const fin = Math.min(siguiente ?? finSubs, g.fin + PERMANENCIA, finSubs - 0.01);
    return { ini: ini[i]!, fin: Math.max(fin, ini[i]! + 0.2) };
  });
}

function ritmos<T extends Ficha>(grupos: T[][], fin: number): number[] {
  const iv = intervalos(grupos.map((g) => ({ inicio: g[0]!.inicio, fin: g[g.length - 1]!.fin })), fin);
  return grupos.map((g, i) => textoDe(g).length / (iv[i]!.fin - iv[i]!.ini));
}

/**
 * Une grupos vecinos mientras haya alguno por encima de 17 car./s y la unión baje el pico sin pasar
 * de 2 líneas: el texto queda más tiempo en pantalla y se lee mejor.
 */
export function suavizarRitmo<T extends Ficha>(grupos: T[][], cpl: number, fin: number): T[][] {
  const exceso = (gs: T[][]) => ritmos(gs, fin).reduce((acc, c) => acc + Math.max(0, c - MAX_CPS) ** 2, 0);
  const cabe = (g: T[]) => g.length > 0 && lineas(textoDe(g), cpl).length <= 2;
  let gs = grupos;
  let actual = exceso(gs);
  for (let vuelta = 0; vuelta < 400 && actual > 0; vuelta++) {
    let mejor: { gs: T[][]; valor: number } | null = null;
    const probar = (cand: T[][]) => {
      const valor = exceso(cand);
      if (valor < actual - 1e-9 && (!mejor || valor < mejor.valor)) mejor = { gs: cand, valor };
    };
    for (let j = 0; j + 1 < gs.length; j++) {
      const a = gs[j]!;
      const b = gs[j + 1]!;
      const antes = gs.slice(0, j);
      const despues = gs.slice(j + 2);
      // Unir los dos grupos.
      const unido = [...a, ...b];
      if (cabe(unido)) probar([...antes, unido, ...despues]);
      // Pasar la última palabra de a al principio de b, o la primera de b al final de a.
      if (a.length > 1 && cabe([a[a.length - 1]!, ...b])) probar([...antes, a.slice(0, -1), [a[a.length - 1]!, ...b], ...despues]);
      if (b.length > 1 && cabe([...a, b[0]!])) probar([...antes, [...a, b[0]!], b.slice(1), ...despues]);
    }
    if (!mejor) break;
    const m = mejor as { gs: T[][]; valor: number };
    gs = m.gs;
    actual = m.valor;
  }
  return gs;
}
