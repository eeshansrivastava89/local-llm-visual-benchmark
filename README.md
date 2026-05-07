# Local LLM Visual Benchmark

Local-first viewer for visual benchmark outputs. The app helps you prepare run folders and copy prompts for external tools, then browses and compares the saved HTML artifacts.

## What It Does

- Checks whether LM Studio's local OpenAI-compatible server is reachable.
- Lists models from LM Studio's `/v1/models` endpoint when available.
- Loads benchmark prompt definitions from `benchmarks/`.
- Creates prepared run slots under `runs/`.
- Generates copyable OpenCode, Pi, or generic prompts with exact output paths.
- Displays saved runs as a gallery and comparison viewer.
- Exports saved results as a static GitHub Pages-ready site.

It does not run models, send chat-completion requests, load models, change LM Studio settings, rank outputs, or use a hosted backend.

## Requirements

- Node.js 24+
- npm
- Optional: LM Studio with the local server enabled

LM Studio default base URL:

```text
http://localhost:1234/v1
```

## Install

```bash
npm install
```

## Run Locally

```bash
npm run dev
```

Open the Astro dev URL shown in the terminal. The UI can call local API routes for LM Studio status, model listing, system stats, benchmark prompts, saved runs, and run-slot preparation.

## Preparing A Run

In the UI:

1. Click `Prepare run`.
2. Choose a benchmark prompt.
3. Choose a discovered model or type a model ID.
4. Pick `OpenCode`, `Pi`, or `Generic`.
5. Click `Prepare run slot`.
6. Copy the generated prompt into your external tool.

The app creates:

```text
runs/<benchmark-id>/<model-slug>/<run-id>/
  metadata.json
  prompt.md
```

The generated prompt tells the external tool to save the final artifact here:

```text
runs/<benchmark-id>/<model-slug>/<run-id>/index.html
```

Optional files:

```text
preview.png
preview.webm
response.raw.txt
```

Refresh the viewer after the external tool writes files.

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

Edit prompts in your normal editor. The app reads them from disk; it does not edit prompts in the browser.

## Viewing And Comparing

The left sidebar filters by model and benchmark prompt. The main area supports:

- `Gallery`: all filtered runs.
- `By model`: model attempts grouped by prompt.
- `By prompt`: prompt outputs compared across models.

Run cards open a detail view with metadata, prompt text, file paths, and artifact links.

## Static Publishing

Build the local server/API version:

```bash
npm run build
```

Build the static GitHub Pages version:

```bash
npm run build:static
```

`build:static` generates `public/export/manifest.json`, copies exported run assets, runs the Astro build, and writes the publish artifact to:

```text
dist-static/
```

Publish `dist-static/` to GitHub Pages. The static build does not need LM Studio or the local API. Static mode can browse exported runs, but it cannot prepare new run slots.

## Verification

```bash
npm test
npm run check
npm run build
npm run build:static
npm run test:e2e
```

## Notes

- `runs/` is ignored by default so local experiments do not get committed accidentally.
- `metadata.json` is the viewer's index record for a run.
- `index.html` is the minimum artifact for a completed visual output.
- System stats are best-effort and informational only.
