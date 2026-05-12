import { assetHref } from "./assets.js";
import { stackAttemptIdentity } from "./runs.js";
import { escapeAttribute, escapeHtml } from "./utils.js";

export function renderComparePreviewGrid(selectedRuns) {
  if (selectedRuns.length === 0) {
    return '<section class="rounded-lg border bg-card p-3 text-sm text-muted-foreground shadow-sm" aria-label="Selected compare runs">Select runs to start comparing visual outputs.</section>';
  }

  return (
    '<section class="grid gap-3 rounded-lg border bg-card p-3 shadow-sm md:grid-cols-2" aria-label="Selected compare runs">' +
      selectedRuns.map(renderComparePreviewCard).join("") +
    "</section>"
  );
}

function renderComparePreviewCard(run) {
  const title = run.benchmark?.title ?? run.benchmark?.id ?? "Untitled run";
  const stack = stackAttemptIdentity(run);
  const videoHref = assetHref(run, run.assets?.videoMp4 ?? run.assets?.video);
  const previewHref = assetHref(run, run.assets?.preview);
  const media = videoHref
    ? '<video class="h-full w-full object-cover" autoplay muted loop playsinline src="' + escapeAttribute(videoHref) + '"></video>'
    : previewHref
      ? '<img class="h-full w-full object-cover" src="' + escapeAttribute(previewHref) + '" alt="" loading="lazy" />'
      : '<div class="preview-placeholder"><strong>No captured media</strong></div>';

  return (
    '<article class="grid min-w-0 gap-2" data-compare-run>' +
      '<div class="grid aspect-video overflow-hidden rounded-lg bg-muted">' + media + "</div>" +
      '<div class="grid min-w-0 gap-0.5">' +
        '<strong class="truncate-line">' + escapeHtml(title) + "</strong>" +
        '<span class="muted-copy truncate-line">' + escapeHtml(stack.label) + "</span>" +
      "</div>" +
    "</article>"
  );
}
