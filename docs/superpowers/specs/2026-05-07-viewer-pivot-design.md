# Visual Benchmark Viewer Pivot Design

## Goal

Turn the app into a local-first viewer and prompt-prep tool for visual benchmark artifacts. The app no longer runs models or sends completion requests.

## Product Shape

- Passive LM Studio discovery: connection status and model list only.
- File-backed benchmark prompt definitions remain in `benchmarks/`.
- Saved outputs live under `runs/{benchmarkId}/{modelSlug}/{runId}/`.
- The UI helps prepare a run slot and generates copyable prompts for OpenCode, Pi, and generic tools.
- The UI focuses on browsing, comparing, and inspecting run artifacts.

## Run Convention

Each run directory may contain:

```text
metadata.json
prompt.md
index.html
preview.png
preview.webm
response.raw.txt
```

`metadata.json` and `prompt.md` are created by the app when preparing a run. `index.html` is the minimum external-tool output for a visible completed artifact. Preview images and videos are optional.

## UI

- Left sidebar: LM Studio status, discovered models, benchmark filters, and quick counts.
- Top toolbar: setup guidance, run-prep guidance, and compare mode controls.
- Main gallery: run cards with preview, status, model, benchmark, timestamp, and artifact actions.
- Compare modes:
  - Gallery: all filtered runs.
  - By model: one model's attempts grouped by prompt.
  - By prompt: one prompt compared across models.
- Detail dialog: preview/HTML links, metadata, prompt text, error text, and file paths.

## Boundaries

- No model execution orchestration.
- No start/stop/cancel controls.
- No LM Studio chat completion calls.
- No model-execution lifecycle logging.
- No leaderboard or voting.
- No framework component kit unless custom Astro components become a blocker.

## Static Publish

The static export keeps working by copying run assets and writing `export/manifest.json`. Static mode can browse exported runs but cannot prepare new run slots because file writes require the local API.
