/**
 * Mezcla de audio (compilador geeper.json → ffmpeg): la voz por escenas, en el orden de la línea de
 * tiempo, con fundidos de 15 ms en cada corte; la música en bucle, bajando cuando habla la voz
 * (sidechaincompress) y con salida suave al final.
 */
import path from "node:path";
import { pista, type Proyecto } from "./esquema";
import { duracionEscenas, ENTRADA } from "./linea";
import { ffmpeg } from "./media";
import type { Registro } from "./proceso";

export const FUNDIDO = 0.015;

export interface PlanMezcla {
  entradas: string[];
  filtro: string;
  total: number;
}

export function planMezcla(p: Proyecto, dir: string, total: number, ducking: boolean): PlanMezcla {
  const voz = pista(p, "voz").clips;
  const musica = p.pistas.find((x) => x.id === "musica")?.clips[0];
  const entradas: string[] = [];
  const indice = new Map<string, number>();
  for (const c of voz) {
    if (!indice.has(c.asset)) {
      indice.set(c.asset, entradas.length);
      entradas.push(path.join(dir, p.assets[c.asset]!.ruta));
    }
  }
  const partes: string[] = [];
  voz.forEach((c, i) => {
    const k = indice.get(c.asset)!;
    const d = c.rango.duracion;
    partes.push(
      `[${k}:a]atrim=start=${c.rango.inicio.toFixed(4)}:duration=${d.toFixed(4)},asetpts=PTS-STARTPTS,` +
        `aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,` +
        `afade=t=in:d=${FUNDIDO},afade=t=out:st=${Math.max(0, d - FUNDIDO).toFixed(4)}:d=${FUNDIDO}[s${i}]`,
    );
  });
  partes.push(`${voz.map((_, i) => `[s${i}]`).join("")}concat=n=${voz.length}:v=0:a=1,adelay=delays=${Math.round(ENTRADA * 1000)}:all=1,apad=whole_dur=${total.toFixed(4)}[voz]`);
  if (musica) {
    const km = entradas.length;
    entradas.push(path.join(dir, p.assets[musica.asset]!.ruta));
    partes.push(
      `[${km}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,atrim=duration=${total.toFixed(4)},` +
        `asetpts=PTS-STARTPTS,volume=${(musica.volumen ?? 0.15).toFixed(3)}[mus]`,
    );
    if (ducking) {
      partes.push(`[voz]asplit=2[voz1][llave]`);
      partes.push(`[mus][llave]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=350[duck]`);
    } else {
      partes.push(`[voz]anull[voz1]`, `[mus]anull[duck]`);
    }
    partes.push(`[duck]afade=t=out:st=${Math.max(0, total - 1.5).toFixed(4)}:d=1.5[mf]`);
    partes.push(`[voz1][mf]amix=inputs=2:normalize=0:duration=first[out]`);
  } else {
    partes.push(`[voz]anull[out]`);
  }
  return { entradas, filtro: partes.join(";"), total };
}

export async function mezclar(p: Proyecto, dir: string, total: number, ducking: boolean, salida: string, log: Registro) {
  const plan = planMezcla(p, dir, total, ducking);
  const args: string[] = [];
  plan.entradas.forEach((ent, i) => {
    const esMusica = i === plan.entradas.length - 1 && p.pistas.some((x) => x.id === "musica");
    if (esMusica) args.push("-stream_loop", "-1");
    args.push("-i", ent);
  });
  await ffmpeg(
    ["-v", "error", ...args, "-filter_complex", plan.filtro, "-map", "[out]", "-t", total.toFixed(4), "-c:a", "pcm_s16le", "-ar", "48000", "-f", "wav", salida],
    log,
  );
  return plan;
}

export { duracionEscenas };
