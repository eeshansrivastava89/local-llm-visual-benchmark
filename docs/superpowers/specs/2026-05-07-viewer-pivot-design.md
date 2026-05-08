# Visual Benchmark Viewer Pivot Design

## Goal

Turn the app into a local-first viewer and prompt-prep tool for visual benchmark artifacts. The app no longer runs models or sends completion requests.

## Product Shape

- Passive LM Studio discovery: connection status and model list only.
- File-backed benchmark prompt definitions remain in `benchmarks/`.
- Saved outputs live under `runs/{benchmarkId}/{modelSlug}/{runId}/`.
- The UI helps prepare a run slot and generates copyable, tool-agnostic prompts for external tools.
- The UI focuses on browsing, comparing, and inspecting run artifacts.
- Local run assets are served by the local API so the browser can render previews and open artifacts without blocked `file://` URLs.

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

- Toolbar: saved-run model filters, benchmark filters, setup guidance, run-prep guidance, and compare mode controls.
- LM Studio modal: current model discovery from LM Studio is shown separately from historical run models discovered from the filesystem.
- Prepare-run panel: a three-step workflow for choosing the slot, copying the generated prompt, and refreshing after the external tool writes files.
- Main gallery: run cards with preview, status, model, benchmark, timestamp, and artifact actions.
- Compare modes:
  - Gallery: all filtered runs.
  - By model: one model's attempts grouped by prompt.
  - By prompt: one prompt compared across models.
- Detail dialog: the saved HTML artifact gets the dominant viewport space; prompt text, useful metadata, and filesystem links stay in a compact inspector.

## Boundaries

- No model execution orchestration.
- No start/stop/cancel controls.
- No LM Studio chat completion calls.
- No model-execution lifecycle logging.
- No leaderboard or voting.
- Tailwind CSS and Basecoat CSS are allowed for polished primitives; model-running logic remains out of scope.
- The UI may serve files from the configured `runs/` folder, but must reject paths outside that folder.

## Static Publish

The static export keeps working by copying run assets and writing `export/manifest.json`. Static mode can browse exported runs but cannot prepare new run slots because file writes require the local API.
