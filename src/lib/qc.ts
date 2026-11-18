/**
 * Compuerta de control de calidad. Mide el archivo entregado y devuelve un informe JSON; si una
 * regla falla, el render no se marca entregado.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { CajaRevisada } from "./compilador";
import type { Formato } from "./esquema";
import { caracteresPorLinea, metricas } from "./formatos";
import { intervalos, type Grupo } from "./linea";
import { ffmpeg, fotograma, probar } from "./media";
import { correr, type Registro } from "./proceso";
import { FFMPEG, FFPROBE } from "./rutas";
import { lineas } from "./subtitulos";

export const OBJETIVO = {
  lufs: -14,
  toleranciaLufs: 1,
  picoMaxDbtp: -1,
  maxCaracteresLinea: 42,
  maxLineas: 2,
  maxCps: 17,
  fps: 30,
  /** Congelado máximo antes de la tarjeta final (s). */
  maxCongelado: 1.0,
  maxDuplicados: 0.1,
} as const;

export interface Regla {
  id: string;
  nombre: string;
  ok: boolean;
  /** Los avisos no bloquean la entrega. */
  aviso?: boolean;
  medido: unknown;
  objetivo: string;
  detalle?: string;
}

export interface InformeQc {
  aprobado: boolean;
  archivo: string;
  medidoEn: string;
  reglas: Regla[];
  hojaContacto?: string;
  fotogramas: { t: number; ruta: string; nota: string }[];
}

export interface Esperado {
  formato: Formato;
  total: number;
  inicioTarjeta: number;
  grupos: Grupo[];
  cajas: CajaRevisada[];
  /** Momentos clave (medio de cada escena) para la hoja de contacto. */
  momentos: { t: number; nota: string }[];
  licencias: { asset: string; licencia: string }[];
  check?: { ok: boolean; errores: number; avisos: number; resumen: string };
}

export interface Sonoridad {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

/** Mide con loudnorm (primera pasada); devuelve los valores medidos. */
export async function medirSonoridad(archivo: string, log?: Registro): Promise<Sonoridad> {
  const r = await correr(FFMPEG, [
    "-hide_banner", "-nostdin", "-i", archivo, "-vn",
    "-af", `loudnorm=I=${OBJETIVO.lufs}:TP=-2:LRA=11:print_format=json`, "-f", "null", "-",
  ], { log: undefined });
  const j = /\{[\s\S]*?"target_offset"[\s\S]*?\}/.exec(r.stderr)?.[0];
  if (!j) throw new Error("loudnorm no devolvió medidas");
  const m = JSON.parse(j) as Sonoridad;
  log?.(`sonoridad: ${m.input_i} LUFS, pico ${m.input_tp} dBTP`);
  return m;
}

/**
 * Segunda pasada de loudnorm (lineal, con las medidas de la primera): corrige el audio del render a
 * −14 LUFS / −1,5 dBTP y copia el video sin recodificar.
 */
export async function normalizarAudio(entrada: string, salida: string, log: Registro): Promise<Sonoridad> {
  const m = await medirSonoridad(entrada, log);
  await ffmpeg([
    "-v", "error", "-i", entrada, "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy",
    "-af",
    `loudnorm=I=${OBJETIVO.lufs}:TP=-2:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:` +
      `measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`,
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "-f", "mp4", salida,
  ], log);
  return m;
}

async function congelados(archivo: string, hasta: number): Promise<{ inicio: number; dur: number }[]> {
  const r = await correr(FFMPEG, [
    "-hide_banner", "-nostdin", "-t", hasta.toFixed(3), "-i", archivo, "-an",
    "-vf", "freezedetect=n=-60dB:d=0.5", "-f", "null", "-",
  ]);
  const out: { inicio: number; dur: number }[] = [];
  const re = /freeze_start: ([\d.]+)[\s\S]*?freeze_duration: ([\d.]+)/g;
  for (let m = re.exec(r.stderr); m; m = re.exec(r.stderr)) out.push({ inicio: Number(m[1]), dur: Number(m[2]) });
  return out;
}

async function duplicados(archivo: string, hasta: number): Promise<{ entrada: number; salida: number }> {
  const r = await correr(FFMPEG, [
    "-hide_banner", "-nostdin", "-t", hasta.toFixed(3), "-i", archivo, "-an",
    "-vf", "mpdecimate", "-fps_mode", "vfr", "-f", "null", "-",
  ]);
  const salida = Number([...r.stderr.matchAll(/frame=\s*(\d+)/g)].pop()?.[1] ?? 0);
  return { entrada: Math.round(hasta * OBJETIVO.fps), salida };
}

export async function contarFotogramas(archivo: string): Promise<number> {
  const r = await correr(FFPROBE, ["-v", "error", "-count_packets", "-select_streams", "v:0", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", archivo]);
  return Number(r.stdout.trim());
}

/** Visualización de cada grupo: el mismo intervalo que usa la animación del compilador. */
export function intervalosSubtitulos(grupos: Grupo[], finSubs: number) {
  const iv = intervalos(grupos, finSubs);
  return grupos.map((g, i) => ({ texto: g.texto, ini: iv[i]!.ini, fin: iv[i]!.fin }));
}

export function revisarSubtitulos(formato: Formato, grupos: Grupo[], finSubs: number) {
  const cpl = caracteresPorLinea(formato);
  const malos: string[] = [];
  let peorLinea = 0;
  let peorLineas = 0;
  let peorCps = 0;
  for (const g of intervalosSubtitulos(grupos, finSubs)) {
    const ls = lineas(g.texto, cpl);
    const largo = Math.max(...ls.map((l) => l.length));
    const cps = g.texto.length / (g.fin - g.ini);
    peorLinea = Math.max(peorLinea, largo);
    peorLineas = Math.max(peorLineas, ls.length);
    peorCps = Math.max(peorCps, cps);
    if (largo > OBJETIVO.maxCaracteresLinea || ls.length > OBJETIVO.maxLineas || cps > OBJETIVO.maxCps) {
      malos.push(`«${g.texto}» (${ls.length} líneas, ${largo} car./línea, ${cps.toFixed(1)} car./s, ${g.ini.toFixed(2)} s)`);
    }
  }
  return { cpl, peorLinea, peorLineas, peorCps: Number(peorCps.toFixed(2)), malos, grupos: grupos.length };
}

export async function hojaDeContacto(archivo: string, momentos: { t: number; nota: string }[], dirSalida: string, log: Registro) {
  await fs.rm(dirSalida, { recursive: true, force: true });
  await fs.mkdir(dirSalida, { recursive: true });
  const fotos: { t: number; ruta: string; nota: string }[] = [];
  for (const [i, m] of momentos.entries()) {
    const ruta = path.join(dirSalida, `${String(i + 1).padStart(2, "0")}.jpg`);
    await fotograma(archivo, m.t, ruta, 360);
    fotos.push({ t: m.t, ruta, nota: m.nota });
  }
  const cols = Math.min(6, fotos.length);
  const filas = Math.ceil(fotos.length / cols);
  const hoja = path.join(dirSalida, "hoja.jpg");
  await ffmpeg(
    ["-v", "error", "-framerate", "1", "-i", path.join(dirSalida, "%02d.jpg"), "-vf", `tile=${cols}x${filas}:padding=6:color=0x111111`, "-frames:v", "1", "-q:v", "3", hoja],
    log,
  );
  return { hoja, fotos };
}

export async function correrQc(archivo: string, esp: Esperado, dirHoja: string, log: Registro): Promise<InformeQc> {
  const m = metricas(esp.formato);
  const info = await probar(archivo);
  const reglas: Regla[] = [];

  // Sonoridad (segunda medición, sobre el archivo ya corregido).
  const s = await medirSonoridad(archivo, log);
  const lufs = Number(s.input_i);
  const tp = Number(s.input_tp);
  reglas.push({
    id: "sonoridad", nombre: "Sonoridad integrada", ok: Math.abs(lufs - OBJETIVO.lufs) <= OBJETIVO.toleranciaLufs,
    medido: lufs, objetivo: `${OBJETIVO.lufs} ± ${OBJETIVO.toleranciaLufs} LUFS`,
  });
  reglas.push({ id: "pico", nombre: "Pico real", ok: tp <= OBJETIVO.picoMaxDbtp, medido: tp, objetivo: `≤ ${OBJETIVO.picoMaxDbtp} dBTP` });

  // Color.
  const v = info.video ?? {};
  const color = { color_space: v.color_space, color_transfer: v.color_transfer, color_primaries: v.color_primaries, color_range: v.color_range, pix_fmt: v.pix_fmt };
  reglas.push({
    id: "color", nombre: "Color Rec.709, rango limitado",
    ok: v.color_space === "bt709" && v.color_transfer === "bt709" && v.color_primaries === "bt709" && v.color_range === "tv" && v.pix_fmt === "yuv420p",
    medido: color, objetivo: "bt709 / bt709 / bt709, tv, yuv420p",
  });

  // Integridad.
  const fotogramas = await contarFotogramas(archivo);
  const esperados = Math.round(esp.total * OBJETIVO.fps);
  reglas.push({
    id: "resolucion", nombre: "Resolución", ok: info.ancho === m.W && info.alto === m.H,
    medido: `${info.ancho}x${info.alto}`, objetivo: `${m.W}x${m.H}`,
  });
  reglas.push({ id: "fps", nombre: "Fotogramas por segundo", ok: v.r_frame_rate === "30/1", medido: v.r_frame_rate, objetivo: "30/1" });
  // Duración del stream de video (el contenedor suma el relleno del códec de audio).
  const durVideo = Number(v.duration ?? info.duracion);
  const durAudio = Number(info.audio?.duration ?? durVideo);
  reglas.push({
    id: "duracion", nombre: "Duración (video y audio)",
    ok: Math.abs(durVideo - esp.total) <= 2 / OBJETIVO.fps + 0.05 && Math.abs(durAudio - durVideo) <= 0.15,
    medido: { video: Number(durVideo.toFixed(3)), audio: Number(durAudio.toFixed(3)) }, objetivo: `${esp.total.toFixed(3)} s; audio a ≤ 0,15 s del video`,
  });
  reglas.push({
    id: "fotogramas", nombre: "Fotogramas (caídos o de más)", ok: Math.abs(fotogramas - esperados) <= 2,
    medido: fotogramas, objetivo: `${esperados} ± 2`,
  });
  const dups = await duplicados(archivo, esp.inicioTarjeta);
  const ratio = dups.entrada ? 1 - dups.salida / dups.entrada : 0;
  const cong = (await congelados(archivo, esp.inicioTarjeta)).filter((c) => c.dur >= OBJETIVO.maxCongelado);
  reglas.push({
    id: "duplicados", nombre: "Fotogramas duplicados (antes de la tarjeta final)", ok: ratio <= OBJETIVO.maxDuplicados && cong.length === 0,
    medido: { proporcion: Number(ratio.toFixed(3)), congelados: cong },
    objetivo: `≤ ${OBJETIVO.maxDuplicados * 100} % y sin congelados de ≥ ${OBJETIVO.maxCongelado} s`,
  });

  // Subtítulos.
  const sub = revisarSubtitulos(esp.formato, esp.grupos, esp.inicioTarjeta);
  reglas.push({
    id: "subtitulos", nombre: "Subtítulos legibles",
    ok: sub.malos.length === 0,
    medido: { peorCaracteresLinea: sub.peorLinea, peorLineas: sub.peorLineas, peorCps: sub.peorCps, grupos: sub.grupos, caracteresPorLinea: sub.cpl },
    objetivo: `≤ ${OBJETIVO.maxCaracteresLinea} car./línea, ≤ ${OBJETIVO.maxLineas} líneas, ≤ ${OBJETIVO.maxCps} car./s`,
    detalle: sub.malos.slice(0, 12).join("\n") || undefined,
  });

  // Zonas seguras (cajas del compilador).
  const fuera = esp.cajas.filter((c) => !c.dentro);
  reglas.push({
    id: "zonas-seguras", nombre: "Texto y logo dentro de la banda segura", ok: fuera.length === 0,
    medido: esp.cajas.map((c) => ({ nombre: c.nombre, dentro: c.dentro, caja: c.caja })),
    objetivo: `dentro de x ${m.segura.x}–${m.segura.x + m.segura.w}, y ${m.segura.y}–${m.segura.y + m.segura.h} px`,
    detalle: fuera.map((c) => c.nombre).join(", ") || undefined,
  });

  if (esp.check) {
    reglas.push({
      id: "hyperframes-check", nombre: "hyperframes check", ok: esp.check.errores === 0,
      medido: { errores: esp.check.errores, avisos: esp.check.avisos }, objetivo: "0 errores", detalle: esp.check.resumen || undefined,
    });
  }

  // Licencias: aviso, no bloquea (la persona decide antes de publicar).
  const dudosas = esp.licencias.filter((l) => /desconocida|revisar/i.test(l.licencia));
  reglas.push({
    id: "licencias", nombre: "Licencias de los assets", ok: dudosas.length === 0, aviso: true,
    medido: esp.licencias, objetivo: "todas conocidas",
    detalle: dudosas.map((d) => `${d.asset}: ${d.licencia}`).join("\n") || undefined,
  });

  const hoja = await hojaDeContacto(archivo, esp.momentos, dirHoja, log);
  return {
    aprobado: reglas.every((r) => r.ok || r.aviso),
    archivo,
    medidoEn: new Date().toISOString(),
    reglas,
    hojaContacto: hoja.hoja,
    fotogramas: hoja.fotos,
  };
}
