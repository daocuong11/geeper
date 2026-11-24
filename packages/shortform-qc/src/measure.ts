import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Measurements } from "./types.js";

const run = promisify(execFile);

export interface Tools {
  /** Defaults to `ffmpeg` / `ffprobe` on PATH, or the FFMPEG / FFPROBE environment variables. */
  ffmpeg?: string;
  ffprobe?: string;
}

function tools(t: Tools = {}) {
  return { ffmpeg: t.ffmpeg ?? process.env.FFMPEG ?? "ffmpeg", ffprobe: t.ffprobe ?? process.env.FFPROBE ?? "ffprobe" };
}

async function stderrOf(bin: string, args: string[]): Promise<string> {
  const r = await run(bin, args, { maxBuffer: 64 * 1024 * 1024 });
  return r.stderr;
}

/** First pass of ffmpeg's loudnorm (EBU R128): integrated loudness, true peak and loudness range. */
export async function measureLoudness(file: string, t?: Tools): Promise<NonNullable<Measurements["loudness"]>> {
  const err = await stderrOf(tools(t).ffmpeg, [
    "-hide_banner", "-nostdin", "-i", file, "-vn", "-af", "loudnorm=I=-14:TP=-1:LRA=11:print_format=json", "-f", "null", "-",
  ]);
  const json = /\{[\s\S]*?"target_offset"[\s\S]*?\}/.exec(err)?.[0];
  if (!json) throw new Error("loudnorm returned no measurements (does the file have audio?)");
  const j = JSON.parse(json) as Record<string, string>;
  return { integrated: Number(j.input_i), truePeak: Number(j.input_tp), lra: Number(j.input_lra) };
}

interface ProbeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  duration?: string;
  color_space?: string;
  color_transfer?: string;
  color_primaries?: string;
  color_range?: string;
  pix_fmt?: string;
}

export async function probe(file: string, t?: Tools): Promise<Pick<Measurements, "video" | "audioDuration">> {
  const r = await run(tools(t).ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { maxBuffer: 16 * 1024 * 1024 });
  const j = JSON.parse(r.stdout) as { streams?: ProbeStream[]; format?: { duration?: string } };
  const v = j.streams?.find((s) => s.codec_type === "video");
  const a = j.streams?.find((s) => s.codec_type === "audio");
  const fallback = Number(j.format?.duration ?? 0);
  return {
    video: v && {
      width: v.width ?? 0,
      height: v.height ?? 0,
      frameRate: v.r_frame_rate ?? "0/1",
      duration: Number(v.duration ?? fallback),
      colorSpace: v.color_space,
      colorTransfer: v.color_transfer,
      colorPrimaries: v.color_primaries,
      colorRange: v.color_range,
      pixFmt: v.pix_fmt,
    },
    audioDuration: a ? Number(a.duration ?? fallback) : undefined,
  };
}

export async function countFrames(file: string, t?: Tools): Promise<number> {
  const r = await run(tools(t).ffprobe, ["-v", "error", "-count_packets", "-select_streams", "v:0", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", file]);
  return Number(r.stdout.trim());
}

/** Stills of at least 0.5 s (ffmpeg freezedetect), up to `until` seconds. */
export async function detectFreezes(file: string, until?: number, t?: Tools): Promise<{ start: number; duration: number }[]> {
  const err = await stderrOf(tools(t).ffmpeg, [
    "-hide_banner", "-nostdin", ...(until ? ["-t", until.toFixed(3)] : []), "-i", file, "-an",
    "-vf", "freezedetect=n=-60dB:d=0.5", "-f", "null", "-",
  ]);
  return parseFreezes(err, until);
}

/**
 * Pairs freezedetect's `freeze_start` / `freeze_duration` lines. A freeze that lasts until the end
 * has no duration line: it runs to `end` (or is reported with duration 0 when `end` is unknown).
 */
export function parseFreezes(stderr: string, end?: number): { start: number; duration: number }[] {
  const out: { start: number; duration: number }[] = [];
  let open: number | null = null;
  for (const m of stderr.matchAll(/freeze_(start|duration): ([\d.]+)/g)) {
    if (m[1] === "start") open = Number(m[2]);
    else if (open !== null) {
      out.push({ start: open, duration: Number(m[2]) });
      open = null;
    }
  }
  if (open !== null) out.push({ start: open, duration: end !== undefined ? Math.max(0, end - open) : 0 });
  return out;
}

/** Share of frames ffmpeg's mpdecimate drops as near-duplicates, up to `until` seconds. */
export async function duplicateRatio(file: string, fps: number, until: number, t?: Tools): Promise<number> {
  const err = await stderrOf(tools(t).ffmpeg, [
    "-hide_banner", "-nostdin", "-t", until.toFixed(3), "-i", file, "-an", "-vf", "mpdecimate", "-fps_mode", "vfr", "-f", "null", "-",
  ]);
  const kept = Number([...err.matchAll(/frame=\s*(\d+)/g)].pop()?.[1] ?? 0);
  const total = Math.round(until * fps);
  return total ? Math.max(0, 1 - kept / total) : 0;
}

export interface MeasureOptions extends Tools {
  fps?: number;
  /** Freeze and duplicate analysis stop here. Default: the whole video. */
  outroStart?: number;
}

/** Runs every measurement. Needs ffmpeg and ffprobe; CPU only. */
export async function measure(file: string, o: MeasureOptions = {}): Promise<Measurements> {
  const [p, loudness, frameCount] = await Promise.all([probe(file, o), measureLoudness(file, o).catch(() => undefined), countFrames(file, o)]);
  const until = Math.min(o.outroStart ?? Infinity, p.video?.duration ?? 0);
  // Duplicates are counted against the file's own rate; a wrong rate is the fps rule's job.
  const [n, d] = (p.video?.frameRate ?? "").split("/").map(Number);
  const rate = n && d ? n / d : (o.fps ?? 30);
  const [freezes, dup] = until > 0
    ? await Promise.all([detectFreezes(file, until, o), duplicateRatio(file, rate, until, o)])
    : [[], 0];
  return { ...p, loudness, frameCount, freezes, duplicateRatio: dup };
}
