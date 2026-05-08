# Design

## Visual Theme

Restrained product UI for a local visual lab. The app uses a neutral canvas, dark ink text, crisp dividers, and small semantic color only for connection and run states. The reference feel is calm, exacting, and native to a serious developer tool.

## Color Palette

- `--background`: `oklch(0.985 0.004 255)`
- `--card`: `oklch(0.995 0.002 255)`
- `--muted`: `oklch(0.955 0.004 255)`
- `--foreground`: `oklch(0.165 0.008 255)`
- `--muted-foreground`: `oklch(0.49 0.012 255)`
- `--border`: `oklch(0.89 0.006 255)`
- `--primary`: `oklch(0.205 0.006 255)`
- `--success`: `oklch(0.58 0.1 158)`
- `--warning`: `oklch(0.7 0.13 78)`
- `--destructive`: `oklch(0.57 0.14 28)`

## Typography

Use the native system UI stack. Keep labels compact, metadata readable, and run titles strong enough for fast scanning. Avoid display fonts and decorative type.

## Layout

Desktop and tablet use a compact toolbar for saved-run model and prompt filters, leaving the viewport for the artifact gallery. The run grid should fit normal result sets in the first viewport and scroll internally only when there are more cards than the visible surface can hold. Passive LM Studio discovery lives in a modal that separates current LM Studio inventory from historical run models discovered from the filesystem.

Run details are artifact-first. Completed runs show the saved `index.html` as the main surface inside the modal. Prompt text, filesystem paths, and a small status/model summary live in a narrow inspector. Optional actions appear only when the corresponding file exists.

## Components

Core components use Astro markup, Tailwind utilities, Basecoat CSS, and vanilla client scripts. The shared vocabulary covers saved-run filters, utility details, status pills, toolbar buttons, inputs, run cards, detail dialog, compare grouping, empty states, and three-step prompt preparation. Buttons and inputs must have consistent default, hover, focus, disabled, and selected states.

## Motion

Use short 150-200ms transitions for selection, disclosure, and hover feedback only. No page-load choreography.
