/**
 * Ediciones encadenadas: un paso puede usar lo que creó un paso anterior. Idea de los guiones de
 * DesignCraft (docs/agents.md §Scripts), adaptada a las ediciones de geeper.json:
 *
 *   [{ "tipo": "agregarTexto", "texto": { "texto": "50 % OFF", "inicio": 1, "duracion": 3 } },
 *    { "tipo": "editarTexto", "id": "$1.id", "cambios": { "posicion": "centro" } }]
 *
 * - `"$N.ruta"` (la cadena entera) se reemplaza por ese valor del resultado del paso N, contando
 *   desde 1 como en el informe; `"$ultimo.ruta"` es el paso anterior.
 * - `"${N.ruta}"` dentro de un texto más largo se reemplaza por el valor como texto.
 * - `$$` escribe un `$` literal. Cualquier otro texto que empiece con `$` queda igual.
 *
 * El resultado de un paso es lo que creó: `{ id, textos, clips, escenas }` (ids nuevos; `id` es el
 * primero). Una referencia a un paso que no existe, que todavía no corrió o que no creó eso es un error
 * que dice qué falta.
 */
import { z } from "zod";
import { aplicarEdicion, Edicion } from "./ediciones";
import type { Proyecto } from "./esquema";

export interface ResultadoPaso {
  id?: string;
  textos: string[];
  clips: string[];
  escenas: string[];
}

export type Paso = { n: number; tipo: string; estado: "ok" | "error" | "omitido"; error?: string; resultado?: ResultadoPaso };

/** Lo que un paso creó: ids que están después y no estaban antes. */
export function resultadoDe(antes: Proyecto, despues: Proyecto): ResultadoPaso {
  const nuevos = (a: string[], b: string[]) => {
    const viejos = new Set(a);
    return b.filter((x) => !viejos.has(x));
  };
  const clips = (p: Proyecto) => p.pistas.flatMap((x) => x.clips.map((c) => c.id));
  const r: ResultadoPaso = {
    textos: nuevos(antes.textos.map((t) => t.id), despues.textos.map((t) => t.id)),
    clips: nuevos(clips(antes), clips(despues)),
    escenas: nuevos(Object.keys(antes.escenas), Object.keys(despues.escenas)),
  };
  const id = r.textos[0] ?? r.clips[0] ?? r.escenas[0];
  return id ? { id, ...r } : r;
}

const REF = /^\$(\d+|ultimo)\.([A-Za-z0-9_.]+)$/;
const DENTRO = /\$\{(\d+|ultimo)\.([A-Za-z0-9_.]+)\}/g;

function buscar(resultados: ResultadoPaso[], quien: string, ruta: string, actual: number): unknown {
  const n = quien === "ultimo" ? actual - 1 : Number(quien);
  if (n < 1 || n >= actual) throw new Error(`«$${quien}.${ruta}» apunta al paso ${n}, que no corrió antes de éste`);
  let v: unknown = resultados[n - 1];
  for (const parte of ruta.split(".")) {
    // Sólo claves propias: «__proto__» o «constructor» no son resultados de un paso.
    if (v === null || typeof v !== "object" || !Object.hasOwn(v, parte)) {
      throw new Error(`«$${quien}.${ruta}»: el paso ${n} no creó «${ruta}» (creó: ${JSON.stringify(resultados[n - 1])})`);
    }
    v = (v as Record<string, unknown>)[parte];
  }
  if (v === undefined) throw new Error(`«$${quien}.${ruta}»: el paso ${n} no creó nada que tenga id`);
  return v;
}

/** Reemplaza las referencias de un valor (recorre objetos y listas). `actual` es el número del paso. */
export function resolverReferencias(valor: unknown, resultados: ResultadoPaso[], actual: number): unknown {
  if (typeof valor === "string") {
    const m = REF.exec(valor);
    if (m) return buscar(resultados, m[1]!, m[2]!, actual);
    const PROTEGIDO = "\u0000";
    return valor
      .replace(/\$\$/g, PROTEGIDO)
      .replace(DENTRO, (_, quien: string, ruta: string) => String(buscar(resultados, quien, ruta, actual)))
      .replace(new RegExp(PROTEGIDO, "g"), "$");
  }
  if (Array.isArray(valor)) return valor.map((x) => resolverReferencias(x, resultados, actual));
  if (valor && typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, resolverReferencias(v, resultados, actual)]));
  }
  return valor;
}

/** Aplica las ediciones en orden; al primer error marca ese paso y omite los siguientes. */
export function aplicarPasos(actual: Proyecto, entrada: unknown[]): { nuevo: Proyecto | null; pasos: Paso[] } {
  const pasos: Paso[] = [];
  const resultados: ResultadoPaso[] = [];
  let nuevo: Proyecto | null = actual;
  entrada.forEach((e, i) => {
    const n = i + 1;
    const tipo = typeof (e as { tipo?: unknown })?.tipo === "string" ? (e as { tipo: string }).tipo : "?";
    if (!nuevo) return void pasos.push({ n, tipo, estado: "omitido" });
    try {
      const antes: Proyecto = nuevo;
      const despues = aplicarEdicion(antes, Edicion.parse(resolverReferencias(e, resultados, n)));
      const resultado = resultadoDe(antes, despues);
      resultados.push(resultado);
      nuevo = despues;
      pasos.push({ n, tipo, estado: "ok", resultado });
    } catch (err) {
      const error = err instanceof z.ZodError
        ? err.issues.map((x) => `${x.path.join(".") || "(raíz)"}: ${x.message}`).join("; ")
        : err instanceof Error ? err.message : String(err);
      pasos.push({ n, tipo, estado: "error", error });
      nuevo = null;
    }
  });
  return { nuevo, pasos };
}
