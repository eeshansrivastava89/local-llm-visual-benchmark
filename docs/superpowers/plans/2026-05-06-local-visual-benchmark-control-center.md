# Local Visual Benchmark Control Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Astro local control center that runs LM Studio visual benchmarks, saves file-backed run records, captures PNG previews, and publishes saved results as a static GitHub Pages site.

**Architecture:** Use Astro for the UI/static site and a local Node TypeScript runner core for LM Studio calls, queue execution, file writes, extraction, and preview capture. UI endpoints and any future CLI call the same runner core; no benchmark logic is duplicated in UI components.

**Tech Stack:** Astro, TypeScript, Node.js, Playwright, Vitest, filesystem JSON/Markdown manifests, LM Studio OpenAI-compatible `/v1` API.

---

## File Map

- `package.json`: scripts, dependencies, dev commands.
- `astro.config.mjs`: Astro static build configuration.
- `tsconfig.json`: shared TypeScript settings.
- `src/runner/types.ts`: shared benchmark, model, queue, run, status, and asset types.
- `src/runner/paths.ts`: repo path resolution, safe slugging, run ID generation, run folder paths.
- `src/runner/benchmarks.ts`: read benchmark Markdown files and build benchmark records.
- `src/runner/lmstudio.ts`: test base URL, list models, send benchmark prompt requests.
- `src/runner/extract-html.ts`: extract a renderable HTML document from raw model text.
- `src/runner/runs.ts`: create run folders and write raw response, HTML, metadata, and status updates.
- `src/runner/capture.ts`: use Playwright to capture `preview.png` and optional video.
- `src/runner/queue.ts`: expand selected benchmarks x models x repeats, execute sequentially, stop after current, cancel now.
- `src/runner/system-stats.ts`: best-effort CPU/RAM/platform/GPU telemetry.
- `src/server/api.ts`: local API route handlers that call runner core functions.
- `src/pages/index.astro`: local control center page.
- `src/pages/results/[...slug].astro`: static-friendly result/detail routes.
- `src/components/*`: focused UI components for connection, run setup, queue status, stats, result grid, detail modal.
- `benchmarks/*.md`: benchmark prompt files, starting with Sakura and Solar System.
- `runs/`: generated local run output, ignored unless sample runs are intentionally committed.
- `public/export/` or generated static data path: publishable manifest/assets for GitHub Pages.
- `tests/runner/*.test.ts`: focused tests for runner core behavior.
- `tests/e2e/*.spec.ts`: smoke tests for local UI and static rendering.

## Phase 0: Project Scaffold

- [x] Create Astro + TypeScript project structure without deleting the existing prototype files.
- [x] Add scripts: `dev`, `build`, `preview`, `test`, `test:e2e`, `lint` or `check`.
- [x] Add dependencies: Astro, TypeScript, Vitest, Playwright, and `gray-matter` for Markdown frontmatter.
- [x] Update `.gitignore` for `node_modules/`, `.astro/`, `dist/`, `runs/`, Playwright artifacts, and local logs.
- [x] Verify `npm install`, `npm run build`, and `npm test` run on the empty scaffold.
- [x] Commit scaffold separately.

## Phase 1: File-Backed Benchmark Definitions

- [x] Move or copy Sakura and Solar System prompt text into repo Markdown benchmark files.
- [x] Define minimal benchmark frontmatter: `id`, `title`, `description`.
- [x] Implement `src/runner/benchmarks.ts` to load benchmark Markdown from disk.
- [x] Append the shared HTML output contract in runner code, not in each prompt.
- [x] Add tests for benchmark loading, missing frontmatter, duplicate IDs, and prompt contract assembly.
- [x] Verify tests and build.
- [x] Commit benchmark definition layer.

## Phase 2: Runner Types, Paths, And Run Metadata

- [x] Define shared TypeScript types for benchmark records, LM Studio models, queue jobs, run status, run metadata, and assets.
- [x] Implement safe model slugging while preserving the exact LM Studio model ID in metadata.
- [x] Implement timestamp-based run IDs.
- [x] Implement run folder path creation under `runs/<benchmark-id>/<model-slug>/<run-id>/`.
- [x] Implement metadata write/update helpers with statuses: `queued`, `running`, `completed`, `failed`, `cancelled`, `skipped`.
- [x] Add tests for slugging, run ID shape, folder paths, and metadata writes.
- [x] Verify tests and build.
- [x] Commit runner storage foundation.

## Phase 3: LM Studio Client

- [x] Implement base URL normalization with default `http://localhost:1234/v1`.
- [x] Implement connection check.
- [x] Implement model listing via `/models`.
- [x] Implement chat/completion request for one benchmark prompt and one model using LM Studio's OpenAI-compatible API.
- [x] Add timeout and abort signal support so `Cancel now` can interrupt active requests.
- [x] Add tests using mocked `fetch` for reachable server, unreachable server, model list success/failure, and aborted request.
- [x] Verify tests and build.
- [x] Commit LM Studio client.

## Phase 4: HTML Extraction And Run Writing

- [x] Implement raw response saving before extraction.
- [x] Implement HTML extraction from complete HTML, fenced HTML, and messy text containing a document.
- [x] Save extraction failures as failed runs with raw response and error metadata.
- [x] Save successful extraction to `index.html`.
- [x] Add tests for clean HTML, fenced HTML, missing HTML, malformed HTML, and failure metadata.
- [x] Verify tests and build.
- [x] Commit extraction and run writing.

## Phase 5: Preview Capture

- [ ] Implement Playwright capture for `preview.png` at configurable timestamp, default `5s`.
- [ ] Store capture status and errors in metadata.
- [ ] Add optional video capture support behind a runner setting, off by default.
- [ ] Ensure missing video is a normal state, not a run failure.
- [ ] Add tests around capture option plumbing and one lightweight Playwright integration smoke test.
- [ ] Verify tests and build.
- [ ] Commit preview capture.

## Phase 6: Queue Engine And Stop Controls

- [ ] Implement matrix expansion from selected benchmarks x selected LM Studio models x repeat count.
- [ ] Execute jobs sequentially.
- [ ] Track active job, completed jobs, failed jobs, cancelled job, and remaining queue.
- [ ] Implement `Stop after current`: finish active job, then stop before the next job.
- [ ] Implement `Cancel now`: abort active request/capture where possible and mark the active run cancelled.
- [ ] Save failed, malformed, and cancelled runs visibly.
- [ ] Add tests for matrix expansion, sequential ordering, graceful stop, cancel now, and failed job continuation policy.
- [ ] Verify tests and build.
- [ ] Commit queue engine.

## Phase 7: Local API Layer

- [ ] Add local API endpoints for status, benchmarks, LM Studio models, system stats, saved runs, start queue, stop after current, and cancel now.
- [ ] Keep endpoints thin; they call runner core only.
- [ ] Add API-level tests or handler tests that confirm endpoints delegate to runner functions and return stable response shapes.
- [ ] Verify tests and build.
- [ ] Commit local API.

## Phase 8: Control Center UI

- [ ] Build the Astro page shell with a restrained app UI, not a marketing page.
- [ ] Add connection panel for base URL, test status, and discovered LM Studio models.
- [ ] Add run setup controls for benchmarks, models, repeat count, PNG capture timestamp, and optional video generation.
- [ ] Add queue controls: Start, Stop after current, Cancel now.
- [ ] Add queue/status panel with current benchmark, model, repeat, elapsed time, and run counts.
- [ ] Add system stats panel with unavailable states for unsupported metrics.
- [ ] Add result grid defaulting to PNG previews.
- [ ] Add top-level Image/Video toggle with PNG fallback when video is missing.
- [ ] Add run detail view with metadata, raw response link/view, prompt text, and open generated HTML.
- [ ] Verify responsive layout with desktop and mobile browser screenshots.
- [ ] Commit control center UI.

## Phase 9: Static Export And GitHub Pages Build

- [ ] Generate a static export manifest from saved runs and benchmark definitions.
- [ ] Ensure static build does not require LM Studio or local runner API.
- [ ] Make static result browsing use exported data/assets only.
- [ ] Add GitHub Pages-friendly build output and path handling.
- [ ] Add a build test that simulates exported runs and verifies `npm run build` succeeds.
- [ ] Commit static export path.

## Phase 10: Documentation And Prototype Cleanup

- [x] Remove old untracked prototype artifacts that are not part of the current Astro/runner plan.
- [ ] Do not add an import script in v1; document the manual path for adding benchmark prompts and generated run outputs.
- [ ] Confirm generated app can display current copied prompt definitions.
- [ ] Update `README.md` with local run, LM Studio setup, prompt editing, static export, and publish instructions.
- [ ] Verify end-to-end with at least one mocked or real LM Studio run.
- [ ] Commit migration/docs.

## Verification Checklist

- [ ] `npm test`
- [ ] `npm run build`
- [ ] Local UI can test LM Studio base URL and handle unreachable server gracefully.
- [ ] Local UI lists models from LM Studio when available.
- [ ] Queue can run multiple benchmarks x multiple models x repeat count.
- [ ] Stop after current saves the active run and stops before the next.
- [ ] Cancel now marks active run cancelled and stops the queue.
- [ ] Failed/malformed model output is saved and visible.
- [ ] PNG preview is generated for successful renderable runs.
- [ ] Video generation is off by default and optional.
- [ ] Static build can browse exported run data without local runner server.
- [ ] Existing prototype/output files are not deleted or rewritten unless explicitly planned.

## Execution Notes

- Commit after each phase or coherent sub-phase.
- Do not introduce Electron, Tauri, Fly, voting, leaderboard, provider adapters, or database storage in v1.
- Do not duplicate runner logic between UI, API, and any future CLI.
- Keep prompts file-edited in v1; the UI reads and displays them but does not edit them.
- Treat telemetry as best-effort informational output.
