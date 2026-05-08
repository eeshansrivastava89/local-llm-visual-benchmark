# Local LLM Visual Benchmark

Local-first viewer for visual benchmark outputs. The app prepares file-backed run folders for external tools, captures preview media from the generated HTML source, and displays every run through the same media-based gallery experience in both local server mode and published static mode.

## Display Contract

The viewer does **not** display generated HTML directly.

For every run:

- Grid cards show `preview.png` when it exists.
- Detail modals show captured video: `preview.mp4` when available, otherwise `preview.webm`.
- If video is missing, the detail modal says that video has not been captured yet.
- There is no live iframe preview, no `Open HTML` action, and no silent fallback from video to HTML.

`index.html` is a source artifact for the capture process. It is not a user-facing viewer surface.

## Server Mode vs Published Mode

### Local server mode

Run with:

```bash
npm run dev
```

Server mode can perform local operations:

- Check LM Studio connection status.
- List LM Studio models from `/v1/models`.
- Sync discovered models to local Pi/OpenCode config files.
- Load benchmark prompt definitions from `benchmarks/`.
- Prepare run folders under `runs/`.
- Delete local run folders.
- Capture missing media from saved `index.html` files.
- Serve captured media files (`preview.png`, `preview.webm`, `preview.mp4`) to the browser.

Server mode display is still media-based. It does not show generated HTML directly.

### Published static mode

Build with:

```bash
npm run build:static
```

Publish the generated `dist-static/` directory.

Published mode can:

- Read `export/manifest.json`.
- Show exported benchmark/run metadata.
- Show exported `preview.png` images in the grid.
- Show exported `preview.mp4` / `preview.webm` videos in details.

Published mode cannot:

- Prepare runs.
- Delete runs.
- Capture media.
- Sync models.
- Call LM Studio.
- Serve or open generated `index.html`.
- Serve raw model responses.

## Requirements

- Node.js 24+
- npm
- Optional: LM Studio with the local server enabled
- Optional: `ffmpeg` for Safari-friendly MP4 conversion during capture

LM Studio default base URL:

```text
http://localhost:1234/v1
```

## Install

```bash
npm install
```

## Preparing A Run

In the UI:

1. Click `Prepare run`.
2. Choose a benchmark prompt.
3. Choose a discovered model.
4. Click `Prepare slot`.
5. Copy the generated prompt into your external tool.

The app creates:

```text
runs/<benchmark-id>/<model-slug>/<run-id>/
  metadata.json
  prompt.md
```

The generated prompt tells the external tool to save only the HTML source here:

```text
runs/<benchmark-id>/<model-slug>/<run-id>/index.html
```

The model/tool should not create screenshots or videos. Media capture is handled by this app.

## Capturing Media

After the external tool writes `index.html`, click `Capture media` in server mode.

The capture process:

1. Finds runs with `index.html` but missing `preview.png` or video.
2. Opens the HTML source locally with Playwright.
3. Saves `preview.png`.
4. Records `preview.webm`.
5. Attempts to create `preview.mp4` with `ffmpeg` when available.
6. Updates `metadata.json`.

The UI shows which card is currently being captured, and server logs include per-run capture progress.

Typical completed run folder:

```text
runs/<benchmark-id>/<model-slug>/<run-id>/
  metadata.json
  prompt.md
  index.html        # local source artifact, not published for display
  preview.png       # grid image
  preview.webm      # detail video
  preview.mp4       # optional Safari-friendly detail video
```

## Why `metadata.json` and `prompt.md` exist per run

`benchmarks/*.md` files are source prompts for future runs. A saved run is a historical snapshot.

Per-run `prompt.md` stores the exact prompt used for that run, including model label, run folder, output path, and output contract. This remains accurate even if the benchmark prompt changes later.

Per-run `metadata.json` stores the durable index record for the run: benchmark snapshot, model, status, timestamps, asset availability, and capture state.

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

The toolbar filters by saved-run model and benchmark prompt. The main area supports:

- `Gallery`: all filtered runs.
- `By model`: model attempts grouped by prompt.
- `By prompt`: prompt outputs compared across models.

Run cards open a detail view with captured video, prompt text, run metadata, and filesystem paths. If a run has only `index.html`, the detail view explicitly asks you to run `Capture media`.

## Static Publishing

Build the local server/API version:

```bash
npm run build
```

Build the static publish version:

```bash
npm run build:static
```

`build:static` generates `public/export/manifest.json`, copies export-safe assets, runs the Astro build, and writes the publish artifact to:

```text
dist-static/
```

Static export copies only publish-safe run files:

```text
metadata.json
prompt.md
preview.png
preview.webm
preview.mp4
```

It does not export `index.html` or raw model response files.

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
- `index.html` is required before media capture can run.
- `preview.mp4` is preferred for Safari/iOS playback; `preview.webm` is used when MP4 is unavailable.
- System stats are best-effort and informational only.
