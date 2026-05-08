# Comprehensive Audit Report: local-llm-visual-benchmark

## Executive Summary

This project is a **local-first visual benchmark viewer** built with Astro, TypeScript, and Tailwind CSS. It pivoted from model execution to a passive viewer + prompt preparation tool. After reviewing all source files, tests, documentation, architecture, security, and UX, here is the complete assessment.

**Verdict:** The backend and core logic are solid, well-tested, and mostly specification-compliant. However, there are **critical UX problems**, several **medium-severity code quality issues**, a **broken `build:static` script**, and **missing architectural boundaries** between UI and logic. The app also does not fully match the intended design language (restrained product UI).

---

## 1. Verification Results

| Command | Result |
|---------|--------|
| `npm test` | **PASS** (39 tests, 10 files) |
| `npm run check` | **PASS** (0 errors, 0 warnings, 0 hints) |
| `npm run build` | **PASS** |
| `npm run build:static` | **FAIL** — Astro prerenderer crashes with module resolution error |
| `npm run test:e2e` | **PASS** (5 tests) |

**⚠️ The `build:static` script fails.** It succeeds in exporting the manifest, but the second `npm run build` (invoked from `build-static.mjs`) crashes with `Cannot find module .../prerender-entry.mjs`. This means the static GitHub Pages publish pipeline is currently broken.

---

## 2. Architecture Review

### 2.1 Structure

```
src/
  lib/          — Core logic (benchmarks, runs, export, paths, prompt-prep, etc.)
  pages/        — Astro pages + API routes
  server/       — API orchestration layer
  styles/       — Global CSS (Tailwind + Basecoat + custom primitives)
tests/
  lib/          — Unit tests for every lib module
  server/       — API orchestration tests
  e2e/          — Playwright E2E tests
public/viewer.js — 689-line vanilla client script (the entire frontend)
```

### 2.2 What Works Well
- ✅ Clear separation between `lib/` (pure logic) and `pages/api/` (HTTP layer)
- ✅ Dependency injection pattern in `createLocalApi()` makes testing easy
- ✅ File-based benchmark loading is clean and extensible
- ✅ Path traversal guards in `run-assets.ts` and `readRunAsset()`
- ✅ Static export architecture with manifest-based fallback

### 2.3 Architectural Issues

#### Issue A: God Script (`public/viewer.js`, 689 lines)
**Severity:** 🔴 High

The entire frontend UI — state management, event wiring, rendering, DOM manipulation, data fetching, and static mode fallback — lives in a single 689-line vanilla JavaScript file. This is a maintenance nightmare:
- No component boundaries
- Global mutable state (`const state = {...}`)
- Direct DOM manipulation scattered throughout
- No type safety
- Testing requires mocking the entire DOM or relying solely on E2E tests
- Any UI bug requires editing a monolithic file

**Recommendation:** Decompose into smaller ES modules or Astro islands. At minimum, separate into: `state.js`, `api.js`, `render/`, `components/`.

#### Issue B: No Frontend Framework
**Severity:** 🟡 Medium

The spec says "vanilla client script" is acceptable, but at 689 lines with complex state transitions, filtering, grouping, and three UI modes (gallery, by-model, by-prompt), the vanilla approach is stretched too thin. Codex chose this likely because it was the fastest path, not because it is the right long-term choice.

**Recommendation:** Consider migrating to a lightweight component model (Astro Islands + Preact/Svelte, or even just splitting into ES modules) if the UI will grow.

#### Issue C: Astro Config Mismatch
**Severity:** 🟡 Medium

```js
// astro.config.mjs
export default defineConfig({
  output: "static",        // ← static output
  adapter: node({ mode: "standalone" }),  // ← but with Node adapter?
});
```

`output: "static"` + `@astrojs/node` adapter is contradictory. Static output means no server. The Node adapter is for server-side rendering. This may be why `build:static` fails — the prerenderer cannot resolve the server entry because the adapter expects a server build but output is set to static.

**Recommendation:** Decide on a single output strategy:
- If you want SSR with API routes → `output: "server"` or `output: "hybrid"`
- If you want fully static → remove the Node adapter entirely
- If you want both (dev server + static export) → use `output: "hybrid"` and explicitly mark API routes with `export const prerender = false` (which is already done)

---

## 3. Code Review

### 3.1 Security

| Issue | Severity | Details |
|-------|----------|---------|
| Path traversal in `/api/run-asset` | 🟢 Low (mitigated) | `readRunAsset()` checks `isPathInside()` for both run directory and asset. Good. |
| No rate limiting on API routes | 🟡 Medium | Anyone on the local network can hit `/api/prepare-run` and create unlimited folders. |
| `runDirectory` param from query string | 🟡 Medium | `/api/run-asset?runDirectory=...&asset=...` accepts arbitrary `runDirectory` values that are validated against `runsRoot`, but an attacker could attempt traversal with symlinks or case variations. |
| No CORS headers | 🟡 Medium | API routes lack CORS headers. If exposed beyond localhost, this is a vulnerability. |
| HTML injection in `viewer.js` | 🟠 High | `renderRunCard()` and `renderBenchmarks()` construct HTML via string concatenation using `escapeHtml()` and `escapeAttribute()`. This is mostly safe but fragile — one missed escape and it's XSS. |

**Security recommendation:** Add `Access-Control-Allow-Origin: http://localhost:4321` (or configurable) to API responses. Consider a simple rate limit or at least a confirmation step for `prepare-run`.

### 3.2 Correctness

| Issue | Severity | Details |
|-------|----------|---------|
| `renderPreview()` uses `indexOf` for `state.runs` | 🟡 Medium | `renderRunCard()` calls `state.runs.indexOf(run)` which is O(n) per card and assumes reference equality. If runs are re-fetched as new objects, this breaks. Better to pass the run ID. |
| `displayRunError()` regex is too broad | 🟡 Medium | `if (/LM Studio/iu.test(message))` catches ANY message containing "LM Studio", which may misclassify legitimate errors. |
| `escapeHtml()` doesn't escape `'` | 🟡 Medium | Single quotes are not escaped. While `escapeAttribute()` adds `&#39;`, any direct use of `escapeHtml()` in an attribute with single quotes is vulnerable. |
| `assetHref()` regex `^[a-z][a-z0-9+.-]*:` | 🟢 Low | This regex misses uppercase protocols (e.g., `HTTP://`). Should be `/^[a-z][a-z0-9+.-]*:/iu`. |
| `build-static.mjs` removes `export/` before copying | 🟡 Medium | It removes `join(staticOutputDirectory, "export")` then copies `publicExportDirectory` there. If paths overlap, this could be destructive. |

### 3.3 Performance

| Issue | Severity | Details |
|-------|----------|---------|
| `loadStats()` every 5 seconds | 🟢 Low | Acceptable for a local dev tool. |
| `renderRuns()` re-renders entire DOM on every filter change | 🟡 Medium | For small datasets (typical), this is fine. But for 100+ runs, this would cause layout thrashing. |
| `hydrateAssetAvailability()` in `listRunMetadata()` | 🟡 Medium | For every run, it stats every asset (up to 6 `stat()` calls per run). With 100 runs = 600 disk stats. This is O(n×m) and could be slow on slow disks. Consider caching or async batching. |
| `renderRunCard()` string concatenation | 🟢 Low | Acceptable for current scale. |

### 3.4 Maintainability

| Issue | Severity | Details |
|-------|----------|---------|
| `viewer.js` is 689 lines of mixed concerns | 🔴 High | State, events, rendering, API, and static fallback all in one file. |
| Magic numbers in CSS | 🟡 Medium | `--radius: 0.625rem`, `0.55rem`, `0.85rem` — many arbitrary values. Design tokens should be named. |
| No CSS class documentation | 🟡 Medium | Classes like `.choice`, `.command-panel`, `.next-step-panel` have no comments explaining their purpose. |
| `package.json` uses `"latest"` for many deps | 🟡 Medium | `@astrojs/check`, `astro`, `gray-matter`, `typescript`, `vitest`, `@playwright/test` are all pinned to `"latest"`. This makes builds non-reproducible and is likely why `build:static` broke (Astro may have updated). |
| `benchmarks/sakura.md` has stray diff | 🟢 Low | The file was modified with an appended instruction about Playwright. This is not a code issue but should be cleaned before commit. |

---

## 4. Specification Compliance

### 4.1 What Matches the Spec

| Spec Item | Status |
|-----------|--------|
| Passive LM Studio discovery (status + models) | ✅ Implemented |
| File-backed benchmark prompts in `benchmarks/` | ✅ Implemented |
| Run convention: `runs/{benchmarkId}/{modelSlug}/{runId}/` | ✅ Implemented |
| Copyable prompts for OpenCode, Pi, Generic | ✅ Implemented |
| UI focuses on browsing, comparing, inspecting | ✅ Implemented |
| `/api/run-asset` serves local files safely | ✅ Implemented |
| Three-step prepare-run workflow | ✅ Implemented |
| Compare modes: Gallery, By model, By prompt | ✅ Implemented |
| Detail dialog with metadata, prompt, file paths | ✅ Implemented |
| Static publish with `manifest.json` | ✅ Partial (export works, build fails) |
| No model execution, no start/stop, no leaderboard | ✅ Confirmed absent |
| Tailwind + Basecoat for UI polish | ✅ Implemented |

### 4.2 What Does NOT Match the Spec

| Spec Item | Gap |
|-----------|-----|
| **"Header and gallery toolbar: setup guidance, run-prep guidance"** | The "Setup" button opens a 3-step guide panel, but there is no persistent toolbar hinting at the workflow. A first-time user sees "Prepare run" and may not understand the 3-step flow without clicking it. |
| **"Left sidebar: saved-run model filters, benchmark filters, passive LM Studio utility details, and system stats"** | ✅ All present, but the sidebar is cramped on tablet. The screenshots show the sidebar consuming ~40% of the viewport on 768px, making the gallery feel squished. |
| **Static mode can browse exported runs but cannot prepare new run slots** | ✅ Implemented, but the static build itself is broken. |
| **Disabled Astro dev toolbar** | ✅ Implemented |
| **Responsive behavior** | 🟡 The tablet breakpoint (768px) still shows the sidebar, but the gallery cards become too narrow. At 390px mobile, the header wraps awkwardly and the title truncates mid-word. |

### 4.3 UX Assessment

#### What Looks Good
- Clean color palette (neutral, restrained)
- Card hover effects are pleasant
- Status dots and badges communicate state clearly
- The single-column mobile layout works

#### What Looks Bad / Not User-Friendly

**1. Information Overload in Sidebar**
- The sidebar contains: Run models, Prompts, LM Studio (collapsible), System stats. That's 4 distinct sections competing for attention.
- The LM Studio panel defaults to closed, which is good, but the "Open/Close" text is tiny and unclear.
- System stats ("14 cores. 26.7 GB / 48.0 GB. Apple M4 Pro.") are interesting but not actionable. They take up space that could be used for run filtering.

**2. "Prepare run" Workflow is Hidden**
- The primary action button "Prepare run" opens a panel that is completely hidden by default. A first-time user has no idea what will happen when they click it.
- The 3-step guide panel (Setup) is also hidden. There's no visual connection between "Setup" and "Prepare run".
- The "Setup" button label is vague — it sounds like configuration, not a tutorial.

**3. Gallery Cards are Inconsistent**
- Cards with previews (images) look great.
- Cards without previews show a gray placeholder with centered text: "No preview yet / Paste the prompt into your tool." This looks like an error state, not a "waiting for you to run the tool" state.
- The "Legacy runner attempt timed out before writing an artifact." message on one card is confusing — it references a "runner" that the app no longer has. This is the legacy error copy that was supposed to be cleaned up.

**4. "Waiting for index.html" vs "HTML ready"**
- These micro-labels are too subtle. Users should be able to see at a glance which runs are complete vs prepared.
- The status pill shows "prepared" but the card also says "Waiting for index.html" — redundant and slightly confusing.

**5. Mobile Header Wrapping**
- At 390px, the title "Local LLM Visual Benchmark" truncates to "Local LLM Visual Benchma..." and the subtitle is completely hidden.
- The "Setup" and "Prepare run" buttons are fine, but the header feels crowded.

**6. Detail Modal Issues**
- The detail modal on mobile fills the entire screen but has no clear "swipe to dismiss" or gesture. The "Close" button is small.
- The "Open HTML", "Prompt file", "Raw response" buttons are side-by-side and may wrap awkwardly on narrow screens.
- The prompt text is shown in a `<pre>` block which doesn't wrap well for long prompts.

**7. No Empty State Guidance**
- When there are no runs, the message is: "No runs match the current filters. Prepare a slot or refresh after your external tool writes files."
- This is okay but doesn't guide the user toward the "Prepare run" button or explain what "external tool" means.

**8. "Refresh" Button Placement**
- The Refresh button is next to the view mode toggles (Gallery / By model / By prompt). It looks like it's part of the view controls, but it has a completely different function. Users may not realize they need to click it after an external tool writes files.

---

## 5. Critical Issues Summary

| # | Issue | Severity | File(s) |
|---|-------|----------|---------|
| 1 | `build:static` is broken — Astro prerenderer crashes | 🔴 Critical | `scripts/build-static.mjs`, `astro.config.mjs` |
| 2 | `viewer.js` is a 689-line god script with no boundaries | 🔴 High | `public/viewer.js` |
| 3 | Astro config contradiction: `output: "static"` + Node adapter | 🔴 High | `astro.config.mjs` |
| 4 | `package.json` pins critical deps to `"latest"` | 🟠 High | `package.json` |
| 5 | UX: "Prepare run" workflow is completely hidden, no onboarding | 🟠 High | `public/viewer.js`, `src/pages/index.astro` |
| 6 | UX: Gallery placeholder cards look like errors | 🟠 High | `public/viewer.js` |
| 7 | HTML constructed via string concat in JS (fragile XSS surface) | 🟠 High | `public/viewer.js` |
| 8 | `listRunMetadata()` does O(n×m) disk stats | 🟡 Medium | `src/lib/runs.ts` |
| 9 | API routes lack CORS and rate limiting | 🟡 Medium | `src/pages/api/*.ts` |
| 10 | `renderRunCard()` uses `indexOf` assuming reference equality | 🟡 Medium | `public/viewer.js` |
| 11 | Legacy runner error copy still present | 🟡 Medium | `public/viewer.js` |
| 12 | `benchmarks/sakura.md` has stray modification | 🟢 Low | `benchmarks/sakura.md` |

---

## 6. Recommendations

### Immediate (Fix Before Commit)

1. **Fix `build:static`**
   - Change `astro.config.mjs` to `output: "hybrid"` (or `"server"`) since you need API routes in dev and static prerendering for publish.
   - Alternatively, remove the Node adapter if you only need static builds.
   - Pin Astro to a specific version first to stop the bleeding.

2. **Pin Dependencies**
   - Replace all `"latest"` in `package.json` with exact or caret versions. The `build:static` failure is almost certainly due to an Astro update.

3. **Clean `benchmarks/sakura.md`**
   - Revert the stray Playwright instruction addition.

### Short Term (Next Sprint)

4. **Refactor `viewer.js`**
   - Split into at least: `api.js` (fetch helpers), `state.js` (state + filtering), `render.js` (DOM construction), `events.js` (event wiring).
   - Consider moving DOM construction to template literals or a lightweight VDOM if the UI will grow.

5. **Improve UX Placeholders**
   - Instead of gray "No preview yet" boxes, show a subtle illustration or icon with a clearer CTA: "Run not started. Click 'Prepare run' to begin."
   - Remove or rephrase "Legacy runner attempt timed out before writing an artifact." — this terminology is obsolete.

6. **Add Onboarding / Empty State**
   - When `runs.length === 0`, show a prominent "Prepare your first run" call-to-action with a 1-2-3 visual guide.
   - Consider adding a small "?" help icon in the header.

7. **Optimize `listRunMetadata()`**
   - Batch or cache asset stat checks. Or switch to a single directory listing + set lookup instead of 6 `stat()` calls per run.

### Medium Term

8. **Add Security Headers**
   - Add CORS headers to API routes.
   - Consider a simple in-memory rate limiter for `/api/prepare-run`.

9. **Improve Mobile Detail Modal**
   - Make the modal swipeable/dismissible on mobile.
   - Increase tap targets.

10. **Reconsider Astro Output Strategy**
    - If the app is primarily a local dev tool with API routes, `output: "server"` with `@astrojs/node` makes sense.
    - If the goal is static GitHub Pages, the API routes need to be serverless or removed in static mode (which they already are via `prerender = false`). The static build should prerender `index.html` and copy the export. The current `build-static.mjs` approach is correct in concept but broken due to the config mismatch.

---

## 7. Conclusion

**Built to specifications?** Mostly yes for backend and data flow. No for UX polish and the static build pipeline.

**Code quality?** Backend is well-structured, tested, and secure. Frontend is a fragile monolith.

**User-friendly?** No. The UI is functional but not welcoming. Hidden workflows, confusing placeholders, and a cramped sidebar make it feel like a developer tool built by developers for developers — which is fine if that's the intent, but the user explicitly asked for better UX.

**The `build:static` failure is the most urgent issue because it breaks the entire publish workflow.** After that, the UX improvements around onboarding, card placeholders, and the god-script refactor should be the next priorities.

---

*Report generated 2026-05-07*
*Reviewed: all source files, tests, docs, Astro config, Playwright E2E, live screenshots (desktop 1440px, tablet 768px, mobile 390px)*
