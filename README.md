<div align="center">

# Local LLM Visual Benchmark

**A creative way to see whether your local models are actually good enough: ask them to build visual experiences, then compare the results.**

[![site](https://img.shields.io/badge/demo-live-cb9f6a)](https://localai.eeshans.com/)
[![node](https://img.shields.io/badge/node-24%2B-3c873a)](package.json)
[![astro](https://img.shields.io/badge/built%20with-Astro-ff5d01)](https://astro.build/)
[![typescript](https://img.shields.io/badge/TypeScript-6.x-3178c6)](https://www.typescriptlang.org/)
[![platform](https://img.shields.io/badge/platform-Apple%20Silicon-blue)]()

[Live workbench](https://localai.eeshans.com/) • [Source](https://github.com/eeshansrivastava89/local-llm-visual-benchmark) • [eeshans.com](https://eeshans.com)

<img width="1467" height="897" alt="image" src="https://github.com/user-attachments/assets/6499b82d-1cba-402e-b2c6-eca3f3b6076e" />


> **Requirements:** [Node.js 24+](https://nodejs.org/) and an Apple Silicon local model source such as [oMLX](https://omlx.ai/) or [LM Studio](https://lmstudio.ai/). OpenCode, Pi, Hermes, LM Studio chat, or another local coding harness can run the generated prompts.


```bash
npm install
npm run dev
```


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
npm run publish
git add public/export
git commit -m "data: publish gallery update"
git push
```

That single publish command refreshes the publish-safe gallery snapshot in `public/export/`, runs checks/tests, and creates a smoke-testable static site in:

```text
dist-static/
```

The GitHub Pages workflow deploys the static build at the custom domain root `https://localai.eeshans.com/` by setting `ASTRO_BASE=/` and publishing `public/CNAME`. To smoke-test a repository-path build instead, run `ASTRO_BASE=/local-llm-visual-benchmark/ npm run build:static` and serve `dist-static/` from that path.

For this repository, GitHub Pages is deployed by `.github/workflows/deploy-pages.yml` on every push to `main`. The live site should be configured to use **GitHub Actions** as its Pages source. There is no separate gallery branch: `main` contains the app code plus the publish-safe `public/export/` snapshot that the workflow deploys.

New captured results still start locally in ignored `runs/`. Running `npm run publish` copies only the public-safe parts into `public/export/`; CI then reuses that committed snapshot rather than reading local `runs/`.

The static export includes benchmark metadata, summary run metadata, preview images, MP4 preview videos, and a build-time machine profile for the header pill. It does not publish raw generated `index.html` files, prepared per-run prompts, raw responses, stream logs, launch commands, local paths, local WebM captures, or operational controls.

## Architecture notes

The browser workbench is intentionally one site, not separate local and public apps. Local dev mode and the static GitHub Pages export share the same Astro page and viewer modules. Static mode only loads `export/manifest.json` and hides local operational controls such as Setup, Prepare run, Refresh/capture, Open in Finder, Recapture, and Delete.

The viewer bootstrap lives in `public/js/app.js`; feature behavior is split into small controller modules under `public/js/` for data loading, model sources, capture, prepare-run, detail actions, workbench rendering, operational-control visibility, icons, and the machine-profile pill.

Captured videos default to 20 seconds at 1600×900. The defaults are defined in `src/lib/capture-media.ts` as `DEFAULT_VIDEO_DURATION_MS` and `DEFAULT_VIEWPORT`.

## Local folders

| Folder | Purpose |
|---|---|
| `benchmarks/` | Source benchmark prompts |
| `runs/` | Local run folders, generated prompts, HTML, screenshots, and videos |
| `public/export/` | Tracked publish-safe gallery snapshot: manifest plus copied preview media |
| `dist-static/` | Final static site artifact |

`runs/` and `dist-static/` are ignored by git so local experiments and build output do not get committed accidentally. `public/export/` is tracked because it is the public gallery data source.

## Commands

```bash
npm run dev           # local app with operational controls
npm run build         # server/API build
npm run build:static  # static gallery build from existing export
npm run publish       # refresh export, validate, and build static site
npm test              # unit tests
npm run test:e2e      # Playwright tests
npm run check         # Astro + TypeScript checks
```

## Privacy

- Runs are local by default.
- oMLX and LM Studio stay on your machine.
- The production site may use PostHog pageview analytics; local builds keep analytics disabled unless explicitly enabled with public env vars.
- The app only publishes captured media, the benchmark prompt text, publish-safe summary metadata, and a build-time machine profile when you build the static export.
- Raw generated HTML, prepared run prompts, raw responses, stream logs, launch commands, local service URLs, and local filesystem paths are kept local and are not included in the published workbench.

## License

Personal project by [Eeshan Srivastava](https://eeshans.com).
