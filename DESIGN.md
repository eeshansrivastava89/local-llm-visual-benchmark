# Design

## Visual Theme

Restrained product UI for a local visual lab, aligned with the Sidequests technical-tool styling. The app uses a warm developer-tool canvas, dark coffee ink text, crisp dividers, compact controls, and small semantic color only for connection and run states. The reference feel is calm, exacting, and native to a serious local tool.

## Color Palette

- `--background`: `#f5f3f0`
- `--foreground`: `#3c3226`
- `--card`: `#ffffff`
- `--card-raised`: `#faf8f5`
- `--primary`: `#5c3d2e`
- `--secondary`: `#ede6de`
- `--muted-foreground`: `#6b5e50`
- `--border`: `#d9d2c9`
- `--input`: `#ebe5dc`
- `--green`: `#16a34a`
- `--warning`: `#d97706`
- `--destructive`: `#d20f39`

Dark mode mirrors the Sidequests coffee palette with `#1c1816` background, `#2a2420` card, `#e0d6cc` foreground, and `#c9a882` primary.

## Typography

Use the native system UI stack. Keep labels compact, metadata readable, and run titles strong enough for fast scanning. Avoid display fonts and decorative type.

## Layout

Desktop and tablet use a compact toolbar for saved-run model and prompt filters, leaving the viewport for the artifact gallery. The desktop run grid uses four columns so the default viewport can show roughly eight normal run cards. Group headers are one-line labels, not section cards. Passive LM Studio discovery lives in a modal with one model inventory; badges distinguish current LM Studio availability from saved filesystem run history.

Run details are artifact-first. Completed runs show captured video (`preview.mp4` when available, otherwise `preview.webm`) as the main surface inside the modal. Generated `index.html` is source input for local capture only; it is not displayed or linked as a viewer surface. Prompt text, filesystem paths, and a small status/model summary live in a narrow inspector. Optional actions appear only when the corresponding publish-safe file exists.

## Components

Core components use Astro markup, Tailwind utilities, Sidequests-derived CSS tokens, and vanilla client scripts. Broad component-framework imports should wait until a component needs Radix-style behavior. The shared vocabulary covers saved-run filters, utility details, status pills, toolbar buttons, inputs, run cards, detail dialog, compare grouping, empty states, and prompt preparation. Buttons and inputs must have consistent default, hover, focus, disabled, and selected states.

## Motion

Use short 150-200ms transitions for selection, disclosure, and hover feedback only. No page-load choreography.
