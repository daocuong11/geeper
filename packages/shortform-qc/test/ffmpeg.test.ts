import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkVideo } from "../src/index.js";

const ffmpeg = process.env.FFMPEG ?? "ffmpeg";
const hasFfmpeg = (() => {
  try {
    execFileSync(ffmpeg, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasFfmpeg)("checkVideo with real ffmpeg (CPU only)", () => {
  let dir: string;
  let clip: string;

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "shortform-qc-"));
    clip = path.join(dir, "clip.mp4");
    // 2 s of moving test pattern with a tone, tagged Rec.709 limited range.
    execFileSync(ffmpeg, [
      "-v", "error", "-y",
      "-f", "lavfi", "-i", "testsrc2=size=360x640:rate=30:duration=2",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2",
      "-c:v", "libx264", "-pix_fmt", "yuv420p",
      "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
      "-c:a", "aac", "-shortest", clip,
    ]);
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("measures the file and reports every rule", async () => {
    const r = await checkVideo(clip, { width: 360, height: 640, duration: 2 });
    const ok = Object.fromEntries(r.rules.map((x) => [x.id, x.ok]));
    expect(ok).toMatchObject({ color: true, resolution: true, fps: true, duration: true, frames: true, duplicates: true });
    // A raw sine is nowhere near -14 LUFS: the loudness rule must notice.
    expect(r.rules.find((x) => x.id === "loudness")).toBeDefined();
  });
});
