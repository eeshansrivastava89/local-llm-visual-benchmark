import { assetHref } from "./assets.js";
import { MAX_COMPARE_SELECTIONS } from "./compare.js";
import { icon } from "./icons.js";
import { stackAttemptIdentity } from "./runs.js";
import { renderStackSummary } from "./stack-pills.js";
import { escapeAttribute, escapeHtml } from "./utils.js";

export function renderComparePreviewGrid(selectedRuns, context = {}) {
  const exportButton = context.canOperate
    ? '<button type="button" class="btn-sm-outline operational-control" data-export-compare-video ' + exportButtonAttrs(selectedRuns, context) + '>' + icon("columns-3") + (context.comparisonExportBusy ? "Exporting…" : "Export video") + '</button>'
    : "";
  const heading = '<div class="compare-panel-head"><h3>' + icon("columns-3") + 'Visual comparison</h3><div class="compare-panel-actions">' + exportButton + '<span>' + String(selectedRuns.length) + "/" + String(MAX_COMPARE_SELECTIONS) + " selected</span></div></div>";
  if (selectedRuns.length === 0) {
    return '<section class="compare-panel" aria-label="Selected compare runs">' + heading + '<p class="compare-panel-empty">Select runs to start comparing visual outputs.</p></section>';
  }

  return (
    '<section class="compare-panel" aria-label="Selected compare runs">' +
      heading +
      '<div class="compare-grid" data-count="' + String(selectedRuns.length) + '">' + selectedRuns.map(renderComparePreviewCard).join("") + "</div>" +
    "</section>"
  );
}

function exportButtonAttrs(selectedRuns, context) {
  const missingVideo = selectedRuns.some((run) => !run.assets?.videoMp4 && !run.assets?.video);
  const disabled = !context.canOperate || context.comparisonExportBusy || selectedRuns.length < 2 || missingVideo;
  const title = missingVideo
    ? "Every selected run needs captured video before export."
    : selectedRuns.length < 2
      ? "Select at least two runs."
      : "Export selected videos as one branded MP4.";
  return 'title="' + escapeAttribute(title) + '" ' + (disabled ? "disabled" : "");
}

function renderComparePreviewCard(run) {
  const title = run.benchmark?.title ?? run.benchmark?.id ?? "Untitled run";
  const model = run.model?.id ?? "Unknown model";
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
        '<strong class="truncate-line">' + escapeHtml(model) + "</strong>" +
        '<span class="compare-prompt truncate-line">' + escapeHtml(title) + "</span>" +
        renderStackSummary(stack) +
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
