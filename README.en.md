# Geeper

[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE) [![shortform-qc on npm](https://img.shields.io/npm/v/shortform-qc?label=shortform-qc)](https://www.npmjs.com/package/shortform-qc) [![shortform-qc CI](https://github.com/saihdez/geeper/actions/workflows/shortform-qc.yml/badge.svg)](https://github.com/saihdez/geeper/actions/workflows/shortform-qc.yml)

**A local video studio: from a topic or a long recording to a finished, editable short video with
automated quality control. Runs on one consumer GPU, $0 a month, no cloud.**

[Español](README.md) · License: [Apache-2.0](LICENSE) · QC as a library: [`shortform-qc`](packages/shortform-qc)

Open-source video generators give you a one-shot result: if a subtitle is wrong or a scene is weak,
you start over. Geeper imports the result into an editable project file (`geeper.json`) so you can fix
it the way you'd fix a document, then re-render without touching the GPU. Nothing is exported until
it passes a quality gate. It is built for people who don't know video editing.

## What it does

1. **Factory:** a topic (or a batch, one per line) → [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo)
   writes the script, voice and images on the GPU → Geeper imports it, compiles it to
   [HyperFrames](https://github.com/heygen-com/hyperframes) with the channel's template → render → QC.
2. **Clips from long material:** VODs and recordings → scored moments with hooks → vertical clips with
   face tracking (YuNet) and subtitles.
3. **Edit without the GPU:** fix subtitles, change what's shown without changing what's heard, remove
   or reorder scenes, drop in your own clip, switch template or aspect ratio (9:16, 16:9, 1:1).
4. **Edit by text:** cut words from what's heard (their audio and time go too), shorten long silences,
   remove filler words. Words with doubtful timing are flagged.
5. **Effects and layers:** transitions, camera moves, speed and color per scene; on-screen text;
   image/SVG/video overlays; sound effects at their second; music aligned so cuts land on the beat.
6. **Voices and languages:** regenerate a scene's voice (Kokoro, CPU), design a new voice from a
   description (VoxCPM2), translate to another language with a local LLM, generate sound effects
   from text (MOSS-SoundEffect).
7. **Deliver:** H.264 render, `.srt` and an optional archive master, only if QC passes.

Every save of `geeper.json` is a version you can go back to.

## Quality gate

Every render is measured with ffmpeg before it can be downloaded:

- −14 LUFS integrated, true peak ≤ −1 dBTP (with a limiter retry when AAC pushes it over)
- Rec.709, limited range; exact duration, fps, resolution and frame count; no freezes
- Subtitles ≤ 42 chars/line, ≤ 2 lines, ≤ 17 chars/s; text inside each target platform's safe zone
- Commercial licenses for every asset when the project is commercial
- Voice-timing confidence, cuts on the beat (warnings), and a contact sheet per render

The same checks are published as a standalone package, [`shortform-qc`](packages/shortform-qc), with a
CLI you can run on any video.

## Requirements

Geeper currently targets one setup and its docs and UI are in Spanish:

- Linux or WSL2 (a Windows desktop build exists, see `docs/ESCRITORIO.md`)
- Node 24, pnpm 10, Python 3, Docker (for MoneyPrinterTurbo)
- ffmpeg (NVENC build recommended)
- An NVIDIA GPU for generation (16 GB VRAM tested). Editing, re-rendering and QC run on the CPU.

All AI models run locally. [MODELOS.md](MODELOS.md) lists each one, its license and whether it allows
commercial use.

## Getting started

```bash
pnpm install
pnpm run setup     # Prisma client, local SQLite in ~/geeper-data, templates
pnpm run doctor    # read-only: says what's missing and how to fix it
pnpm run dev:up    # web on http://localhost:3300 + worker
```

GPU jobs go through a single queue with a lock, one at a time, so a consumer machine isn't
overloaded.

## Project layout

| Path | What |
|---|---|
| `src/app` | Next.js UI and API routes |
| `src/lib` | Core: schema, compiler to HyperFrames, QC, voice, subtitles, importers |
| `worker/` | Job queue and GPU lock |
| `py/` | Python helpers (face tracking, reframing, alignment, sound effects) |
| `packages/shortform-qc` | The QC gate as an npm package |
| `docs/` | Product, decisions and design notes (Spanish) |

## Contributing

Issues and pull requests are welcome, in English or Spanish. See [CONTRIBUTING.md](CONTRIBUTING.md).
Security issues: [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE). Code adapted from other projects is credited in [NOTICE](NOTICE). Models and
external tools keep their own licenses ([MODELOS.md](MODELOS.md)).
