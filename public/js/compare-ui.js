import { assetHref } from "./assets.js";
import { icon } from "./icons.js";
import { stackAttemptIdentity } from "./runs.js";
import { escapeAttribute, escapeHtml } from "./utils.js";

export function renderComparePreviewGrid(selectedRuns) {
  const heading = '<div class="compare-panel-head"><h3>' + icon("columns-3") + 'Visual comparison</h3><span>' + String(selectedRuns.length) + "/4 selected</span></div>";
  if (selectedRuns.length === 0) {
    return '<section class="compare-panel" aria-label="Selected compare runs">' + heading + '<p class="compare-panel-empty">Select runs to start comparing visual outputs.</p></section>';
  }

  return (
    '<section class="compare-panel" aria-label="Selected compare runs">' +
      heading +
      '<div class="compare-grid">' + selectedRuns.map(renderComparePreviewCard).join("") + "</div>" +
    "</section>"
  );
}

function renderComparePreviewCard(run) {
  const title = run.benchmark?.title ?? run.benchmark?.id ?? "Untitled run";
  const stack = stackAttemptIdentity(run);
  const videoHref = assetHref(run, run.assets?.videoMp4 ?? run.assets?.video);
  const previewHref = assetHref(run, run.assets?.preview);
  const media = videoHref
    ? '<video class="h-full w-full object-cover" data-managed-loop-video autoplay muted playsinline preload="auto" ' +
      (previewHref ? 'poster="' + escapeAttribute(previewHref) + '" ' : '') +
      'src="' + escapeAttribute(videoHref) + '"></video>'
    : previewHref
      ? '<img class="h-full w-full object-cover" src="' + escapeAttribute(previewHref) + '" alt="" loading="lazy" />'
      : '<div class="preview-placeholder"><strong>No captured media</strong></div>';

  return (
    '<article class="compare-card" data-compare-run>' +
      '<div class="compare-media">' + media + "</div>" +
      '<div class="grid min-w-0 gap-0.5">' +
        '<strong class="truncate-line">' + escapeHtml(title) + "</strong>" +
        '<span class="muted-copy truncate-line">' + escapeHtml(stack.label) + "</span>" +
      "</div>" +
    "</article>"
  );
}

export function syncManagedCompareVideos(root = document) {
  root.querySelectorAll("[data-managed-loop-video]").forEach((video) => {
    if (video.dataset.loopManaged === "true") return;
    video.dataset.loopManaged = "true";

    const resetNearLoopBoundary = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      if (video.currentTime >= video.duration - 0.18) {
        video.currentTime = Math.min(0.05, Math.max(0, video.duration - 0.25));
        void video.play().catch(() => {});
      }
    };

    video.addEventListener("timeupdate", resetNearLoopBoundary);
    video.addEventListener("ended", () => {
      video.currentTime = 0.05;
      void video.play().catch(() => {});
    });
  });
}
