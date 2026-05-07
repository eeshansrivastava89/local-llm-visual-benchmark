# Visual Benchmark Viewer Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace benchmark execution with a local artifact viewer and prompt-prep workflow.

**Architecture:** Keep Astro, benchmark loading, run discovery, static export, LM Studio passive status, and system stats. Remove model-execution and preview-capture paths. Add a small prompt-prep module that creates run folders, metadata, and copyable tool prompts.

**Tech Stack:** Astro, TypeScript, Vitest, Playwright, custom CSS, vanilla client script.

---

## Phase 1: Scope Reset

- [x] Add product/design context for the viewer pivot.
- [x] Add the reduced pivot spec and implementation checklist.
- [x] Remove outdated execution-control docs or mark them superseded.

## Phase 2: Delete Execution Surface

- [x] Delete execution API routes and old execution/capture/extraction modules.
- [x] Remove LM Studio chat-completion code.
- [x] Remove execution state from the local API response.
- [x] Delete or rewrite tests that assert model-execution behavior.

## Phase 3: Add Prompt Prep

- [x] Add `prompt.md` to run paths and run assets.
- [x] Add a prompt-prep module that creates `metadata.json` and `prompt.md`.
- [x] Add `/api/prepare-run`.
- [x] Test path creation, prompt contents, and API validation.

## Phase 4: Rebuild Viewer UI

- [x] Replace execution controls with left-sidebar filters, gallery, compare modes, setup guidance, and run-prep panel.
- [x] Preserve static fallback browsing.
- [x] Keep detail inspection for prompt, HTML, preview, metadata, and errors.
- [x] Add E2E coverage for passive discovery, prompt prep, compare filtering, and static mode.

## Phase 5: Docs And Cleanup

- [x] Rewrite README around viewer usage and external-tool prompts.
- [x] Remove ignored build artifacts from the workspace.
- [x] Run `npm test`, `npm run check`, `npm run build`, `npm run build:static`, and `npm run test:e2e`.
- [x] Commit the pivot.
