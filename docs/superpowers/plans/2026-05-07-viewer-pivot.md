# Visual Benchmark Viewer Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace benchmark execution with a local artifact viewer and prompt-prep workflow.

**Architecture:** Keep Astro, benchmark loading, run discovery, static export, LM Studio passive status, and system stats. Remove model-execution and preview-capture paths. Add a small prompt-prep module that creates run folders, metadata, and copyable tool prompts.

**Tech Stack:** Astro, TypeScript, Tailwind CSS, Basecoat CSS, Vitest, Playwright, vanilla client script.

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

## Phase 6: UX Polish

- [x] Add Tailwind CSS and Basecoat CSS for a stronger shared UI vocabulary.
- [x] Replace the rough custom viewer shell with a restrained product UI.
- [x] Preserve passive LM Studio discovery, prompt prep, static fallback, and compare modes.
- [x] Verify desktop/mobile behavior with Playwright E2E.

## Phase 7: Product Flow Hardening

- [x] Add `/api/run-asset` so local captured media loads through the local web app instead of blocked `file://` URLs, while generated HTML and raw response files stay unserved.
- [x] Reorder the sidebar around saved run filters first; move passive LM Studio details and discovered models into a utility panel.
- [x] Turn prepare-run into a three-step slot workflow: choose slot, copy prompt, save artifact and refresh.
- [x] Disable the Astro dev toolbar for this project.
- [x] Fix tablet spacing, mobile detail overflow, and legacy runner error wording.
- [x] Verify no horizontal overflow, no broken preview images, and no dev toolbar with Playwright screenshots.

## Phase 8: Detail And Model Source UX

- [x] Make run details artifact-first: completed runs show captured video in the modal, with saved `index.html` kept as capture source only.
- [x] Remove stale tool/error fields from the primary run inspector.
- [x] Hide optional artifact actions, including raw response, unless the filesystem reports the file exists.
- [x] Keep the run gallery within the viewport with denser cards and internal run-surface scrolling for larger result sets.
- [x] Separate current LM Studio models from historical filesystem run models in the LM Studio modal.
