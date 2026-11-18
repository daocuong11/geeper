/**
 * Ediciones que sólo tocan geeper.json (ninguna usa la GPU). Son funciones puras: reciben un
 * proyecto válido y devuelven otro nuevo, validado.
 */
import { z } from "zod";
import { Formato, Mostrar, pista, validarProyecto, type Asset, type Proyecto } from "./esquema";

export const Edicion = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("corregirSubtitulo"), escena: z.string(), desde: z.number().int(), hasta: z.number().int(), texto: z.string() }),
  z.object({ tipo: z.literal("quitarCorreccion"), escena: z.string(), desde: z.number().int() }),
  z.object({ tipo: z.literal("quitarEscena"), escena: z.string() }),
  z.object({ tipo: z.literal("moverEscena"), escena: z.string(), a: z.number().int().min(0) }),
  z.object({ tipo: z.literal("cambiarFormato"), formato: Formato }),
  z.object({ tipo: z.literal("cambiarPlantilla"), plantilla: z.string().min(1) }),
  z.object({ tipo: z.literal("cambiarMostrar"), mostrar: z.array(Mostrar) }),
  z.object({
    tipo: z.literal("ajusteVisual"),
    escena: z.string(),
    ajuste: z.enum(["cubrir", "contener"]).optional(),
    ancla: z.enum(["centro", "arriba", "abajo"]).optional(),
  }),
  z.object({ tipo: z.literal("renombrar"), nombre: z.string().min(1) }),
  z.object({
    tipo: z.literal("cambiarVoz"),
    motor: z.enum(["mpt", "kokoro"]).optional(),
    voz: z.string().min(1).optional(),
    velocidad: z.number().min(0.5).max(2).optional(),
  }),
]);
export type Edicion = z.infer<typeof Edicion>;

function clonar(p: Proyecto): Proyecto {
  return structuredClone(p);
}

function indiceDe(p: Proyecto, escena: string): number {
  const i = pista(p, "voz").clips.findIndex((c) => c.escena === escena);
  if (i < 0) throw new Error(`No existe la escena ${escena}`);
  return i;
}

export function aplicarEdicion(original: Proyecto, ed: Edicion): Proyecto {
  const p = clonar(original);
  switch (ed.tipo) {
    case "corregirSubtitulo": {
      const e = p.escenas[ed.escena];
      if (!e) throw new Error(`No existe la escena ${ed.escena}`);
      if (ed.desde < 0 || ed.hasta > e.palabras.length || ed.hasta <= ed.desde) throw new Error("Rango de palabras inválido");
      // Una corrección nueva reemplaza a las que se solapan con ella.
      e.correcciones = e.correcciones.filter((c) => c.hasta <= ed.desde || c.desde >= ed.hasta);
      const oido = e.palabras.slice(ed.desde, ed.hasta).map((w) => w.texto).join(" ");
      if (ed.texto.trim() !== oido) e.correcciones.push({ desde: ed.desde, hasta: ed.hasta, texto: ed.texto.trim() });
      e.correcciones.sort((a, b) => a.desde - b.desde);
      break;
    }
    case "quitarCorreccion": {
      const e = p.escenas[ed.escena];
      if (!e) throw new Error(`No existe la escena ${ed.escena}`);
      e.correcciones = e.correcciones.filter((c) => c.desde !== ed.desde);
      break;
    }
    case "quitarEscena": {
      if (pista(p, "voz").clips.length <= 1) throw new Error("No se puede quitar la única escena");
      const i = indiceDe(p, ed.escena);
      pista(p, "voz").clips.splice(i, 1);
      pista(p, "visual").clips.splice(i, 1);
      delete p.escenas[ed.escena];
      break;
    }
    case "moverEscena": {
      const i = indiceDe(p, ed.escena);
      for (const id of ["voz", "visual"] as const) {
        const clips = pista(p, id).clips;
        const [c] = clips.splice(i, 1);
        clips.splice(Math.min(ed.a, clips.length), 0, c!);
      }
      break;
    }
    case "cambiarFormato":
      p.formato = ed.formato;
      break;
    case "cambiarPlantilla":
      p.plantilla = ed.plantilla;
      break;
    case "cambiarMostrar":
      p.mostrar = ed.mostrar;
      break;
    case "ajusteVisual": {
      const c = pista(p, "visual").clips[indiceDe(p, ed.escena)]!;
      c.ajuste = ed.ajuste;
      c.ancla = ed.ancla;
      break;
    }
    case "renombrar":
      p.nombre = ed.nombre;
      break;
    case "cambiarVoz":
      // Sólo cambia cómo se generará la próxima voz; lo que ya suena no cambia hasta regenerarla.
      if (ed.motor) p.voz.motor = ed.motor;
      if (ed.voz) p.voz.voz = ed.voz;
      if (ed.velocidad) p.voz.velocidad = ed.velocidad;
      break;
  }
  return validarProyecto(p);
}

/** Reemplaza el clip visual de una escena por un asset ya registrado (p. ej. un archivo subido). */
export function reemplazarVisual(original: Proyecto, escena: string, asset: Asset): Proyecto {
  const p = clonar(original);
  p.assets[asset.id] = asset;
  const c = pista(p, "visual").clips[indiceDe(p, escena)]!;
  c.asset = asset.id;
  c.rango = { inicio: 0, duracion: c.rango.duracion };
  return validarProyecto(limpiarAssets(p));
}

/** Quita del índice los assets que ya no usa ningún clip (los archivos se quedan en disco). */
export function limpiarAssets(p: Proyecto): Proyecto {
  const usados = new Set(p.pistas.flatMap((x) => x.clips.map((c) => c.asset)));
  for (const id of Object.keys(p.assets)) if (!usados.has(id)) delete p.assets[id];
  return p;
}
