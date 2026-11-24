# Contributing to Geeper

Thanks for helping. Issues and pull requests are welcome in English or Spanish.

## Before you start

- For anything bigger than a small fix, open an issue first so we can agree on the approach.
- Geeper is local-first and costs $0 to run: no paid APIs, no telemetry, no cloud services in the
  default path.
- Every model or asset must have a known license. Add new ones to [MODELOS.md](MODELOS.md) with their
  source and whether they allow commercial use. Non-commercial models can't be the default.
- Code copied or ported from another project must be under a compatible license (MIT, BSD,
  Apache-2.0) and credited in [NOTICE](NOTICE). GPL/AGPL projects can only run as separate processes;
  don't copy their code.

## Setup

```bash
pnpm install
pnpm run setup
pnpm run doctor
```

## Checks

Run these before opening a pull request. None of them need a GPU.

```bash
pnpm run typecheck
pnpm run lint
pnpm test
```

For `packages/shortform-qc` (needs ffmpeg on `PATH`):

```bash
cd packages/shortform-qc
npx vitest run --root .
npx tsc -p tsconfig.build.json
```

Don't add tests that need a GPU: anything that loads a model should go through the job queue and be
testable with `--dry-run` or a fake lock.

## Pull requests

- Keep each pull request to one change, with a test when behavior changes.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat(qc): ...`, `fix(voz): ...`).
- UI text is in Spanish and written for people who don't know video editing: plain words and one
  recommended option.

By contributing, you agree that your contribution is licensed under Apache-2.0, the license of this
repository.

## Conduct

Be respectful. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
