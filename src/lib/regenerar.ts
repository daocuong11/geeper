/**
 * Regenerar la voz de una escena o del guion completo con Kokoro (CPU) y realinear los subtítulos con
 * whisper. Sólo se rehace lo que cambió: la síntesis y la alineación son pasos con manifiesto.
 */
import path from "node:path";
import { describirAsset, guardarProyecto, registrarAssetsEnDb } from "./almacen";
import { sha256Texto } from "./archivos";
import { pista, validarProyecto, type Escena, type Palabra, type Proyecto } from "./esquema";
import { tiemposDeVoz } from "./importador";
import { limpiarAssets } from "./ediciones";
import { LICENCIAS } from "./licencias";
import { escenasEnLinea } from "./linea";
import { paso, type Contexto } from "./pasos";
import { crearAudio, esperarAudio } from "./mpt";
import { correr } from "./proceso";
import { HYPERFRAMES_VERSION, MPT_CONTENEDOR, MPT_TAREAS } from "./rutas";
import { huellaPesos } from "./modelos";
import { MODELO_WHISPER, sintetizar } from "./voz";

const tokens = (s: string) => s.split(/\s+/).filter(Boolean);

async function sintetizarAsset(ctx: Contexto & { signal?: AbortSignal }, p: Proyecto, texto: string) {
  const { motor, voz, velocidad, idioma } = p.voz;
  const clave = sha256Texto(JSON.stringify({ texto, motor, voz, velocidad })).slice(0, 12);
  const id = `voz-tts-${clave}`;
  const ruta = `assets/${id}${motor === "mpt" ? ".mp3" : ".wav"}`;
  const r = await paso(
    ctx,
    "voz.sintetizar",
    { archivos: [], params: { texto, motor, voz, velocidad }, motor: motor === "mpt" ? "mpt-api-audio+kokoro-82m" : `hyperframes@${HYPERFRAMES_VERSION}+kokoro-82m` },
    [path.join(ctx.dir, ruta)],
    async ([tmp]) => {
      if (motor === "mpt") {
        // Kokoro de MPT (CPU): misma voz y mismo ritmo que el short original.
        const taskId = await crearAudio(texto, voz, velocidad, idioma === "es" ? "es-ES" : idioma);
        ctx.log(`MPT /audio: tarea ${taskId}`);
        await esperarAudio(taskId, ctx.signal);
        await correr("docker", ["cp", `${MPT_CONTENEDOR}:${MPT_TAREAS}/${taskId}/audio.mp3`, tmp!], { log: ctx.log });
        return { id, tareaMpt: taskId };
      }
      await sintetizar(texto, voz, velocidad, tmp!, ctx.log);
      return { id, tareaMpt: null };
    },
  );
  const asset = await describirAsset(ctx.dir, ruta, {
    id,
    tipo: "audio",
    source: "tts",
    licencia: LICENCIAS.kokoro!,
    regenerar: {
      motor, voz, velocidad, texto, modelo: "kokoro-82m", tareaMpt: r.resultado.tareaMpt,
      // El Kokoro de MPT vive en su contenedor: sólo se conoce la huella de los pesos locales.
      pesos: motor === "kokoro" ? await huellaPesos("kokoro-82m-onnx") : null,
      alineacion: { modelo: `whisper-${MODELO_WHISPER}`, pesos: await huellaPesos(`whisper-${MODELO_WHISPER}`) },
    },
  });
  const palabras = await tiemposDeVoz(ctx, path.join(ctx.dir, ruta), texto, p.voz.idioma);
  return { asset, palabras };
}

/**
 * Lo que la voz nueva tiene que decir: las palabras de la escena menos las recortadas por la edición
 * por texto (palabras o muletillas; los silencios no cambian el texto).
 */
export function textoADecir(e: Escena): string {
  const quitados = e.recortes.filter((r) => r.motivo !== "silencio");
  if (!quitados.length) return e.texto;
  return e.palabras
    .filter((w) => {
      const medio = (w.inicio + w.fin) / 2;
      return !quitados.some((r) => medio >= r.inicio && medio <= r.fin);
    })
    .map((w) => w.texto)
    .join(" ");
}

/** Conserva las correcciones si la escena sigue teniendo exactamente las mismas palabras. */
function conservarCorrecciones(e: Escena, nuevas: Palabra[]): Escena["correcciones"] {
  const igual = e.palabras.length === nuevas.length && e.palabras.every((w, i) => w.texto === nuevas[i]!.texto);
  return igual ? e.correcciones : [];
}

export async function regenerarVoz(
  ctx: Contexto & { signal?: AbortSignal },
  proyectoId: string,
  original: Proyecto,
  escenaId: string | null,
): Promise<{ version: number; asset: string }> {
  const p = structuredClone(original);
  const voz = pista(p, "voz").clips;
  const visual = pista(p, "visual").clips;

  if (escenaId) {
    const e = p.escenas[escenaId];
    if (!e) throw new Error(`No existe la escena ${escenaId}`);
    const texto = tokens(textoADecir(e)).join(" ");
    if (!texto) throw new Error("La escena no tiene texto para decir");
    const { asset, palabras } = await sintetizarAsset(ctx, p, texto);
    p.assets[asset.id] = asset;
    const i = voz.findIndex((c) => c.escena === escenaId);
    const dur = asset.duracion!;
    voz[i] = { ...voz[i]!, asset: asset.id, rango: { inicio: 0, duracion: dur } };
    visual[i] = { ...visual[i]!, rango: { inicio: visual[i]!.rango.inicio, duracion: dur } };
    e.correcciones = conservarCorrecciones(e, palabras);
    e.palabras = palabras;
    e.texto = palabras.map((w) => w.texto).join(" ");
    // Los recortes eran tiempos de la voz anterior: la nueva ya no dice lo recortado.
    e.recortes = [];
  } else {
    // Guion completo: el texto de las escenas actuales (sin lo recortado), en orden. Cada escena
    // conserva su tramo de palabras.
    const orden = escenasEnLinea(p);
    const textos = orden.map((x) => tokens(textoADecir(x.escena)));
    const cuentas = textos.map((t) => t.length);
    const texto = textos.map((t) => t.join(" ")).join(" ");
    const { asset, palabras } = await sintetizarAsset(ctx, p, texto);
    if (palabras.length !== cuentas.reduce((a, b) => a + b, 0)) {
      throw new Error(`La alineación devolvió ${palabras.length} palabras y el guion tiene ${cuentas.reduce((a, b) => a + b, 0)}`);
    }
    p.assets[asset.id] = asset;
    const dur = asset.duracion!;
    let k = 0;
    const limites: number[] = [0];
    const tramos: Palabra[][] = [];
    for (const [j, n] of cuentas.entries()) {
      tramos.push(palabras.slice(k, k + n));
      k += n;
      if (j < cuentas.length - 1) {
        const ultima = palabras[k - 1];
        const siguiente = palabras[k];
        const corte = ultima && siguiente ? (ultima.fin + Math.max(ultima.fin, siguiente.inicio)) / 2 : limites[limites.length - 1]!;
        limites.push(Math.max(limites[limites.length - 1]! + 0.05, corte));
      }
    }
    limites.push(dur);
    orden.forEach((x, j) => {
      const ini = limites[j]!;
      const fin = Math.max(ini + 0.05, limites[j + 1]!);
      voz[j] = { ...voz[j]!, asset: asset.id, rango: { inicio: ini, duracion: fin - ini } };
      visual[j] = { ...visual[j]!, rango: { inicio: visual[j]!.rango.inicio, duracion: fin - ini } };
      const e = p.escenas[x.escena.id]!;
      e.correcciones = conservarCorrecciones(e, tramos[j]!);
      e.palabras = tramos[j]!;
      e.texto = tramos[j]!.map((w) => w.texto).join(" ");
      e.recortes = [];
    });
    p.guion.texto = texto;
  }
  const final = validarProyecto(limpiarAssets(p));
  const nuevo = Object.values(final.assets).find((a) => a.source === "tts" && pista(final, "voz").clips.some((c) => c.asset === a.id));
  const version = await guardarProyecto(proyectoId, final, escenaId ? `Voz regenerada: escena ${escenaId}` : "Voz regenerada: guion completo");
  await registrarAssetsEnDb(proyectoId, final);
  return { version, asset: nuevo?.id ?? "" };
}
