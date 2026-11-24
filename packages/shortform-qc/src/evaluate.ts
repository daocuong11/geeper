import { commercialUse } from "./licenses.js";
import { CANVAS, inside, safeZone } from "./safe-zones.js";
import { describeProblem, reviewCues } from "./subtitles.js";
import { resolveTargets } from "./targets.js";
import type { Expectations, Measurements, Report, Rule } from "./types.js";

/** "30/1" or "30000/1001" → frames per second. */
export function parseRate(rate: string): number {
  const [n, d] = rate.split("/").map(Number);
  return d ? n! / d : Number(n);
}

/**
 * Turns measurements into pass/fail rules. Pure: no ffmpeg, no file system. A rule whose inputs are
 * missing (no expected duration, no subtitles, ...) is left out rather than guessed.
 */
export function evaluate(m: Measurements, exp: Expectations = {}, file = ""): Report {
  const t = resolveTargets(exp.targets);
  const fps = exp.fps ?? 30;
  const rules: Rule[] = [];

  if (m.loudness) {
    const { integrated, truePeak } = m.loudness;
    rules.push({
      id: "loudness", name: "Integrated loudness", ok: Math.abs(integrated - t.lufs) <= t.lufsTolerance,
      measured: integrated, target: `${t.lufs} ± ${t.lufsTolerance} LUFS`,
    });
    rules.push({ id: "true-peak", name: "True peak", ok: truePeak <= t.maxTruePeak, measured: truePeak, target: `≤ ${t.maxTruePeak} dBTP` });
  }

  const v = m.video;
  if (v) {
    if (exp.requireRec709 !== false) {
      const color = { colorSpace: v.colorSpace, colorTransfer: v.colorTransfer, colorPrimaries: v.colorPrimaries, colorRange: v.colorRange, pixFmt: v.pixFmt };
      rules.push({
        id: "color", name: "Rec.709, limited range",
        ok: v.colorSpace === "bt709" && v.colorTransfer === "bt709" && v.colorPrimaries === "bt709" && v.colorRange === "tv" && v.pixFmt === "yuv420p",
        measured: color, target: "bt709 / bt709 / bt709, tv, yuv420p",
        detail: v.colorSpace ? undefined : "No color tags: players will guess. Encode with -colorspace bt709 -color_trc bt709 -color_primaries bt709 -color_range tv.",
      });
    }
    const w = exp.width ?? (exp.format && CANVAS[exp.format].width);
    const h = exp.height ?? (exp.format && CANVAS[exp.format].height);
    if (w && h) {
      rules.push({ id: "resolution", name: "Resolution", ok: v.width === w && v.height === h, measured: `${v.width}x${v.height}`, target: `${w}x${h}` });
    }
    const rate = parseRate(v.frameRate);
    rules.push({ id: "fps", name: "Frame rate", ok: Math.abs(rate - fps) < 0.01, measured: v.frameRate, target: `${fps} fps` });

    if (exp.duration !== undefined) {
      const audio = m.audioDuration ?? v.duration;
      rules.push({
        id: "duration", name: "Duration (video and audio)",
        ok: Math.abs(v.duration - exp.duration) <= 2 / fps + 0.05 && Math.abs(audio - v.duration) <= t.avSyncTolerance,
        measured: { video: Number(v.duration.toFixed(3)), audio: Number(audio.toFixed(3)) },
        target: `${exp.duration.toFixed(3)} s; audio within ${t.avSyncTolerance} s of video`,
      });
      if (m.frameCount !== undefined) {
        const expected = Math.round(exp.duration * fps);
        rules.push({
          id: "frames", name: "Frame count (dropped or extra)", ok: Math.abs(m.frameCount - expected) <= t.frameTolerance,
          measured: m.frameCount, target: `${expected} ± ${t.frameTolerance}`,
        });
      }
    }
  }

  if (m.duplicateRatio !== undefined || m.freezes) {
    const fromSource = exp.expectedDuplicates ?? 0;
    const cap = Math.min(1, t.maxDuplicates + fromSource);
    const ratio = m.duplicateRatio ?? 0;
    const freezes = (m.freezes ?? []).filter((f) => f.duration >= t.maxFreeze);
    rules.push({
      id: "duplicates", name: "Duplicated frames and freezes", ok: ratio <= cap && freezes.length === 0,
      measured: { ratio: Number(ratio.toFixed(3)), freezes, ...(fromSource ? { fromSource } : {}) },
      target: `≤ ${Math.round(cap * 100)} % duplicated, no freeze ≥ ${t.maxFreeze} s`,
    });
  }

  if (exp.subtitles?.length) {
    const r = reviewCues(exp.subtitles, t);
    const warnOnly = exp.subtitleSpeedWarnOnly === true;
    const failing = r.problems.filter((p) => p.shape || (p.speed && !warnOnly));
    rules.push({
      id: "subtitles", name: warnOnly ? "Readable subtitles (shape)" : "Readable subtitles",
      ok: failing.length === 0,
      measured: { worstCharsPerLine: r.worstLine, worstLines: r.worstLines, worstCps: r.worstCps, cues: r.cues },
      target: `≤ ${t.maxCharsPerLine} chars/line, ≤ ${t.maxLines} lines${warnOnly ? "" : `, ≤ ${t.maxCps} chars/s`}`,
      detail: failing.slice(0, 12).map(describeProblem).join("\n") || undefined,
    });
    if (warnOnly) {
      const fast = r.problems.filter((p) => p.speed && !p.shape);
      rules.push({
        id: "subtitle-speed", name: "Subtitle reading speed", ok: fast.length === 0, warning: true,
        measured: { worstCps: r.worstCps }, target: `≤ ${t.maxCps} chars/s`,
        detail: fast.slice(0, 12).map(describeProblem).join("\n") || undefined,
      });
    }
  }

  if (exp.boxes?.length && exp.format) {
    const zone = safeZone(exp.format, exp.platforms);
    const out = exp.boxes.filter((b) => !inside(b, zone));
    rules.push({
      id: "safe-zone", name: "Text and logos inside the safe zone", ok: out.length === 0,
      measured: exp.boxes.map((b) => ({ name: b.name, inside: inside(b, zone) })),
      target: `x ${zone.x}–${zone.x + zone.w}, y ${zone.y}–${zone.y + zone.h} px`,
      detail: out.map((b) => b.name).join(", ") || undefined,
    });
  }

  if (exp.assets?.length) {
    const classified = exp.assets.map((a) => ({ ...a, commercial: commercialUse(a.license) }));
    const bad = classified.filter((a) => a.commercial !== "yes");
    rules.push({
      id: "licenses", name: exp.commercial ? "Asset licenses (commercial use)" : "Asset licenses",
      ok: bad.length === 0, warning: !exp.commercial, measured: classified,
      target: "every asset allows commercial use",
      detail: bad.map((a) => `${a.name}: ${a.license} (${a.commercial === "no" ? "non-commercial" : "unconfirmed"})`).join("\n") || undefined,
    });
  }

  return { passed: rules.every((r) => r.ok || r.warning), file, measuredAt: new Date().toISOString(), rules };
}
