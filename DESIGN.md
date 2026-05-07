# Design

## Visual Theme

Restrained product UI for a local visual lab. The app uses a quiet warm-neutral canvas, dark ink text, soft green connection states, and a small amber accent for prepared or incomplete artifacts.

## Color Palette

- `--surface`: `oklch(0.985 0.006 95)`
- `--panel`: `oklch(0.958 0.008 95)`
- `--panel-strong`: `oklch(0.925 0.01 95)`
- `--ink`: `oklch(0.19 0.012 250)`
- `--muted`: `oklch(0.48 0.018 250)`
- `--line`: `oklch(0.82 0.012 95)`
- `--accent`: `oklch(0.56 0.105 155)`
- `--amber`: `oklch(0.67 0.13 72)`
- `--danger`: `oklch(0.56 0.14 28)`

## Typography

Use the native system UI stack. Keep labels compact, metadata readable, and run titles strong enough for fast scanning. Avoid display fonts and decorative type.

## Layout

Desktop uses a persistent left rail for model and prompt selection with a wide artifact gallery on the right. Mobile collapses to a single column with filters before the run grid. Cards are only used for run artifacts and compact guidance panels.

## Components

Core components are custom Astro markup and vanilla client scripts: sidebar filters, status pills, toolbar buttons, run cards, detail dialog, compare grouping, and prompt-prep panel. Buttons and inputs share one vocabulary for hover, focus, disabled, and selected states.

## Motion

Use short 150-200ms transitions for selection, disclosure, and hover feedback only. No page-load choreography.
