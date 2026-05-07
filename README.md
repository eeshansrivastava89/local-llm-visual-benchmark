# Local LLM Visual Benchmark

Local control center for running visual HTML benchmark prompts against LM Studio models, saving every run to disk, capturing previews, and publishing saved results as a static demo.

## What It Does

- Connects to LM Studio's OpenAI-compatible local server.
- Lists models from `/v1/models`.
- Runs one or many benchmark prompts across one or many selected models.
- Supports repeat counts, defaulting to `1`.
- Saves raw responses, extracted `index.html`, metadata, and previews under `runs/`.
- Captures a mandatory PNG preview and optional video preview.
- Preserves failed, malformed, and cancelled runs as evidence.
- Shows local system stats as best-effort informational telemetry.
- Exports saved runs to a static GitHub Pages-ready build.

It does not launch LM Studio, load or unload models, change LM Studio settings, manage resources, vote on results, or use a hosted backend.

## Requirements

- Node.js 24+
- npm
- LM Studio with the local server enabled
- Playwright browsers installed by npm dependencies

LM Studio default base URL:

```text
http://localhost:1234/v1
```

The UI exposes this value so you can change it if your LM Studio server uses a different host or port.

## Install

```bash
npm install
```

## Run Locally

```bash
npm run dev
```

Open the Astro dev URL shown in the terminal. The local UI can call the API routes used for LM Studio status, model listing, queue control, system stats, and saved runs.

When you start a benchmark from the UI, the terminal running `npm run dev` prints lifecycle logs with a `[benchmark]` prefix. The logs include queue start/stop/cancel events, model IDs, benchmark IDs, repeat index, run directory, and job failures.

## Benchmark Prompts

Benchmark prompts are Markdown files in `benchmarks/`.

Each file needs frontmatter:

```markdown
---
id: sakura
title: Sakura Tree
description: Dreamy Japanese cherry blossom tree animation.
---

Prompt text goes here.
```

Edit prompts in your normal editor. The app reads them from disk; v1 does not edit prompts in the browser.

The runner appends a shared HTML output contract automatically. Do not duplicate that contract in every prompt unless the benchmark itself needs extra constraints.

## Runs

Generated runs are written under:

```text
runs/<benchmark-id>/<model-slug>/<run-id>/
```

Typical files:

```text
metadata.json
response.raw.txt
index.html
preview.png
preview.webm
```

`preview.webm` only exists when video preview generation is enabled. `runs/` is ignored by default so local experiments do not get committed accidentally.

## Static Publishing

Build the local server/API version:

```bash
npm run build
```

Build the static GitHub Pages version:

```bash
npm run build:static
```

`build:static` generates `public/export/manifest.json`, copies exported run assets, runs the Astro build, and writes a static publish artifact to:

```text
dist-static/
```

Publish `dist-static/` to GitHub Pages. The static build does not need LM Studio or the local runner API. If the browser cannot reach `/api/*`, the UI falls back to `/export/manifest.json`.

## Verification

```bash
npm test
npm run build
npm run build:static
npm run check
npm run test:e2e
```

## Notes

- The local queue runs sequentially for predictable resource use.
- `Stop after current` lets the active run finish and skips the rest.
- `Cancel now` aborts the active run when possible and marks it cancelled.
- System stats are best-effort. GPU telemetry may be unavailable, especially on macOS or non-NVIDIA systems.
