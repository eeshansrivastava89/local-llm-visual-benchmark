# Local Visual Benchmark Control Center Design

## Summary

Build a local web app for running and reviewing visual HTML benchmark outputs from LM Studio. The app is a local control center: it checks LM Studio connectivity, lists available LM Studio models, starts and stops benchmark runs, shows basic machine telemetry, captures previews, and displays saved results. The same saved run data should also build into a static Astro site that can be published to GitHub Pages as a demo.

This is not a hosted voting app, cloud runner, model manager, or LM Studio replacement. LM Studio owns model loading, runtime settings, and resource management. This app owns benchmark orchestration, file-backed run tracking, preview capture, and static result presentation.

## Goals

- Run visual benchmark prompts against one or many LM Studio models.
- Support one or many benchmark prompts per queue.
- Support visible repeat counts, defaulting to `1`.
- Save every run with raw response, extracted HTML, metadata, and preview assets.
- Preserve failed, malformed, and cancelled runs as benchmark evidence.
- Provide useful stop controls: stop after current run and cancel now.
- Show LM Studio connection status, discovered models, and local system stats.
- Keep definitions and run history file-backed so they are reproducible, inspectable, and publishable.
- Build a static GitHub Pages site from saved run data and assets.

## Non-Goals

- No voting or leaderboard.
- No Fly backend for v1.
- No accounts, comments, shared hosted database, or public write endpoint.
- No provider adapters beyond LM Studio.
- No launching, configuring, loading, or unloading LM Studio models.
- No automatic memory/resource management or queue pausing.
- No browser-based prompt editor in v1.
- No model alias/provider registry in v1.
- No benchmark suite concept in v1; users select one or many prompts directly.
- No Electron or Tauri packaging in v1.

## Architecture

Use Astro for the app shell and static publishing path. Use a local Node TypeScript runner core for benchmark execution, file writes, LM Studio calls, and preview capture.

Local authoring mode:

```text
Astro UI -> local runner API -> LM Studio /v1 -> run folders + metadata + previews
```

Static publish mode:

```text
saved runs + exported manifest -> Astro static build -> GitHub Pages
```

The runner core is the single source of benchmark execution logic. UI endpoints and any future CLI must call the same runner functions. If a CLI would duplicate validation, matrix expansion, LM Studio calls, file writing, or capture logic, skip the CLI until it can stay a thin wrapper.

## UI Responsibilities

The UI is a local control center. It can:

- Show and test the LM Studio base URL, defaulting to `http://localhost:1234/v1`.
- List models returned by LM Studio's `/v1/models` endpoint.
- Let the user select benchmark prompts, discovered models, repeat count, and preview options.
- Start a benchmark queue.
- Stop after the current run.
- Cancel the active run immediately when possible.
- Show queue progress, current benchmark, current model, elapsed time, and run status.
- Show local system information and best-effort live stats.
- Browse saved runs with PNG previews by default.
- Switch the results grid to video previews with one top-level toggle when videos exist.
- Open the raw generated HTML for a run.
- Display prompt text for a benchmark.

The UI cannot:

- Launch LM Studio.
- Load or unload LM Studio models.
- Change LM Studio settings.
- Change GPU, RAM, runtime, or model allocation settings.
- Edit benchmark prompt files in v1.
- Auto-pause or auto-cancel based on resource thresholds.

## Benchmark Definitions

A benchmark is one prompt/task, such as `sakura` or `solar-system`.

Benchmark prompts live as Markdown files in the repo. They are edited with a normal editor, not through the v1 UI. The app can read and display them, and can provide a rescan/reload action.

Prompts do not need general variable templating in v1. The runner appends a shared HTML output contract to each prompt, for example: return one complete HTML document and no explanation. The runner creates output folders itself, receives the LM Studio response, extracts the renderable HTML, and writes files.

## Model Handling

Models come from LM Studio's `/v1/models` endpoint. V1 does not include a manual model ID field, model aliases, provider labels, or editable model registry.

The exact LM Studio model ID is displayed in the UI and stored in run metadata. Folder paths use filesystem-safe slugs derived from the model ID only because model IDs may contain path separators, colons, spaces, or other awkward characters.

## Run Matrix

The run setup exposes the generalized matrix directly:

```text
selected benchmarks x selected LM Studio models x repeat count
```

The default repeat count is `1`, but repeat count is visible and configurable. No advanced controls are hidden behind a separate mode.

The queue starts sequentially in v1. That keeps resource behavior predictable and makes stop/cancel behavior simpler. Parallel execution can be reconsidered later only if sequential runs become too slow and resource usage is well understood.

## Run Storage

Runs are saved to disk using benchmark ID, model slug, and run ID. The exact naming can be finalized during implementation, but the storage model should follow this shape:

```text
runs/<benchmark-id>/<model-slug>/<run-id>/
  metadata.json
  response.raw.txt
  index.html
  preview.png
  preview.webm
```

`preview.webm` is optional and exists only when video preview generation is enabled. `metadata.json` stores the exact LM Studio model ID, model slug, benchmark ID, run ID, timestamps, settings, status, error details if any, and asset paths.

Failed, malformed, and cancelled runs are still written. They should appear in the results browser with clear status and error information.

## Preview Capture

PNG preview generation is mandatory for every successfully renderable run. The default capture is a single high-quality still image, not a frame strip. The capture timestamp should be configurable and default to a sensible midpoint such as `5s`, because animations often need a short time to settle.

10-second motion preview generation is optional and off by default. When enabled, the runner should generate a short video asset for each renderable run. The results grid still defaults to PNG previews; a top-level Image/Video toggle switches cards to video where available and falls back to PNG with a small unavailable state where video is missing.

Use Playwright for local HTML rendering and screenshot capture. Prefer Playwright's browser video recording first for v1 motion previews. Add FFmpeg conversion later only if WebM compatibility, H.264 needs, or file size become real problems.

## Stop Behavior

V1 has two stop controls:

- `Stop after current`: stops accepting new queue work, lets the active generation/capture finish, saves the active run normally, then stops the queue.
- `Cancel now`: aborts the active LM Studio request or capture when possible, marks the active run cancelled, saves partial metadata/error state, and stops the queue.

The app should not auto-cancel or auto-pause based on resource thresholds. Resource stats are informational. LM Studio remains responsible for model/runtime resource management.

## System Stats

System stats are best-effort and should never block benchmark execution if unavailable.

Always attempt to show:

- OS/platform.
- CPU architecture/core information.
- Total and free RAM.
- Basic process/system uptime.
- LM Studio connection status.
- LM Studio models returned from `/v1/models`.

Where available, show:

- Memory pressure or equivalent platform signal.
- GPU name, utilization, VRAM, temperature, and related stats.

NVIDIA machines can use `nvidia-smi` if present. macOS/Apple Silicon should show reliable OS and unified memory data, but GPU-specific live VRAM/utilization may be unavailable without fragile tooling. If a metric cannot be detected, show it as unavailable instead of inventing a value.

## Static Publishing

The published demo is static. It reads exported run data and assets generated locally. GitHub Pages should be sufficient for v1 because there is no public write path, voting, backend, or hosted runner.

The static site should support:

- Browse benchmarks.
- Browse models/runs.
- View PNG previews.
- Toggle video previews where assets exist.
- Open generated HTML output.
- View run metadata and prompt text.

Static publishing must not require LM Studio or the local runner server.

## Implementation Boundaries

Keep the implementation small and DRY:

- One runner core owns LM Studio calls, matrix expansion, extraction, run writes, and capture.
- UI endpoints call runner core functions.
- Future CLI commands, if added, call the same runner core functions.
- One run metadata schema powers local UI and static export.
- Browser local storage is allowed only for UI preferences, not source-of-truth benchmark definitions or run history.
- Prefer file manifests over a database in v1.

## Open Implementation Details

These can be decided during implementation without changing the product design:

- Exact run ID format.
- Exact safe-slug algorithm for model IDs.
- Exact Markdown prompt folder path.
- Whether generated export manifests live under `data/`, `public/`, or a build-only cache.
- Whether the local runner API is an Astro dev server integration, a separate Node server, or a small process started alongside Astro.
