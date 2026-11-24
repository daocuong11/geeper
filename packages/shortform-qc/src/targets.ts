import type { Targets } from "./types.js";

/**
 * Defaults for short-form delivery: −14 LUFS / −1 dBTP (what YouTube, TikTok and Instagram normalize
 * to), and the common broadcast caption limits of 42 characters per line, 2 lines, 17 characters/s.
 */
export const DEFAULT_TARGETS: Targets = {
  lufs: -14,
  lufsTolerance: 1,
  maxTruePeak: -1,
  maxCharsPerLine: 42,
  maxLines: 2,
  maxCps: 17,
  maxFreeze: 1,
  maxDuplicates: 0.1,
  frameTolerance: 2,
  avSyncTolerance: 0.15,
};

export function resolveTargets(t?: Partial<Targets>): Targets {
  return { ...DEFAULT_TARGETS, ...t };
}
