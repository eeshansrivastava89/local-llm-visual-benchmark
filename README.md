<div align="center">

# Local LLM Visual Benchmark

**A creative way to see whether your local models are actually good enough: ask them to build visual experiences, then compare the results.**

[![site](https://img.shields.io/badge/demo-live-cb9f6a)](https://eeshansrivastava89.github.io/local-llm-visual-benchmark/)
[![node](https://img.shields.io/badge/node-24%2B-3c873a)](package.json)
[![astro](https://img.shields.io/badge/built%20with-Astro-ff5d01)](https://astro.build/)
[![typescript](https://img.shields.io/badge/TypeScript-6.x-3178c6)](https://www.typescriptlang.org/)
[![platform](https://img.shields.io/badge/platform-Apple%20Silicon-blue)]()

[Live workbench](https://eeshansrivastava89.github.io/local-llm-visual-benchmark/) • [Source](https://github.com/eeshansrivastava89/local-llm-visual-benchmark) • [eeshans.com](https://eeshans.com)

```bash
npm install
npm run dev
```

> **Requirements:** [Node.js 24+](https://nodejs.org/) and an Apple Silicon local model source such as [oMLX](https://omlx.ai/) or [LM Studio](https://lmstudio.ai/). OpenCode, Pi, Hermes, LM Studio chat, or another local coding harness can run the generated prompts.

</div>

## Why this exists

Model benchmarks are usually abstract: scores, tokens, leaderboards, and tiny deltas that do not always explain what a model can actually do.

This project takes a more practical route. It gives local models small visual build tasks like a solar system, a sakura tree, a macro wildflower scene, or a sunset ocean study. The model has to produce a working HTML artifact. The app captures a screenshot and 20-second preview video, then lets you compare outputs by model or by prompt.

If a model understands layout, animation, visual hierarchy, browser APIs, and instruction-following, the result usually looks better. If it struggles, you can see exactly where it falls apart.

The point of view is intentionally narrow: this is an Apple Silicon daily-driver stack benchmark, not a universal local-inference leaderboard. The project is about finding which combination of MLX/oMLX or LM Studio, model artifact, coding harness, and prompt workflow is usable enough for real local work.

## What it tests

| | |
|---|---|
| **Visual reasoning** | Can the model translate a prompt into a coherent scene? |
| **Frontend execution** | Can it produce valid HTML/CSS/JS that actually runs? |
| **Animation quality** | Does motion feel intentional, smooth, and visible? |
| **Instruction following** | Does it save the artifact in the requested place and respect constraints? |
| **Model comparison** | Which local model gives the best result for the same benchmark? |
| **Rerun quality** | Does the same model improve when prompted again? |

## How it works

1. Start oMLX or LM Studio and load the models you want to test.
2. Open this app locally with `npm run dev`.
3. Use **Setup** to refresh discovered models and optionally sync LM Studio models into Pi or OpenCode.
4. Click **Prepare run**, choose a benchmark, model source, model, and harness, then copy the generated prompt.
5. Paste the prompt into OpenCode, Pi, Hermes, LM Studio chat, or another local tool.
6. The tool writes `index.html` into the prepared run folder.
7. Click **Refresh** to reload saved runs and capture missing preview media.
8. Browse results in the workbench using **By prompt**, **By model**, or **Table**. In **Table**, select rows to compare visual runs side by side.

The live site is the same workbench as a static export of captured results. The local app is where run preparation, capture, deletion, folder-opening, and config sync happen.

## Setup

Install dependencies:

```bash
npm install
```

Start the local app:

```bash
npm run dev
```

oMLX defaults to:

```text
http://127.0.0.1:8000/v1
```

LM Studio defaults to:

```text
http://localhost:1234/v1
```

You can use any harness that can create the requested `index.html` file. OpenCode, Pi, and Hermes are useful comparison points because the harness changes tool calling, file writes, retries, and recovery behavior. LM Studio config sync remains available for supported harnesses.

## Publishing your own gallery

After you capture some runs locally:

```bash
npm run build:static
```

That creates a static site in:

```text
dist-static/
```

The default static build uses the GitHub Pages base path `/local-llm-visual-benchmark/`. To smoke-test that exact output locally, serve `dist-static/` from that path rather than the domain root.

For this repository, GitHub Pages is deployed by `.github/workflows/deploy-pages.yml` on every push to `main`. The live site should be configured to use **GitHub Actions** as its Pages source; do not manually update a serving branch after normal code changes.

The workflow rebuilds the app shell from `main` and reuses the current published `export/` snapshot so existing gallery media is not lost when local `runs/` are absent in CI. New captured results still start locally in `runs/`; publish them with a local static build when you intentionally want to refresh the public gallery data.

The static export includes benchmark metadata, summary run metadata, preview images, videos, and a build-time machine profile for the header pill. It does not publish raw generated `index.html` files, prepared per-run prompts, raw responses, stream logs, launch commands, local paths, or operational controls.

## Architecture notes

The browser workbench is intentionally one site, not separate local and public apps. Local dev mode and the static GitHub Pages export share the same Astro page and viewer modules. Static mode only loads `export/manifest.json` and hides local operational controls such as Setup, Prepare run, Refresh/capture, Open in Finder, Recapture, and Delete.

The viewer bootstrap lives in `public/js/app.js`; feature behavior is split into small controller modules under `public/js/` for data loading, model sources, capture, prepare-run, detail actions, workbench rendering, operational-control visibility, icons, and the machine-profile pill.

Captured videos default to 20 seconds. The default is defined in `src/lib/capture-media.ts` as `DEFAULT_VIDEO_DURATION_MS`.

## Local folders

| Folder | Purpose |
|---|---|
| `benchmarks/` | Source benchmark prompts |
| `runs/` | Local run folders, generated prompts, HTML, screenshots, and videos |
| `public/export/` | Temporary export manifest and copied media |
| `dist-static/` | Final static site artifact |

`runs/`, `public/export/`, and `dist-static/` are ignored by git so local experiments do not get committed accidentally.

## Commands

```bash
npm run dev           # local app with operational controls
npm run build         # server/API build
npm run build:static  # static gallery export
npm test              # unit tests
npm run test:e2e      # Playwright tests
npm run check         # Astro + TypeScript checks
```

## Privacy

- Runs are local by default.
- oMLX and LM Studio stay on your machine.
- The app only publishes captured media, the benchmark prompt text, publish-safe summary metadata, and a build-time machine profile when you build the static export.
- Raw generated HTML, prepared run prompts, raw responses, stream logs, launch commands, local service URLs, and local filesystem paths are kept local and are not included in the published workbench.

## License

Personal project by [Eeshan Srivastava](https://eeshans.com).
