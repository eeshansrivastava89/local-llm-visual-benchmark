import { assetHref } from "./assets.js";
import { displayRunError, needsMediaCapture, runCardIdentity, runCardMediaMessage, runCardState, runKind } from "./runs.js";
import { escapeAttribute, escapeHtml, formatDateShort } from "./utils.js";

export function renderRunsTable(runs, context) {
  const totalPages = Math.max(1, Math.ceil(runs.length / context.runsPerPage));
  const runPage = Math.min(Math.max(context.runPage, 1), totalPages);
  const startIndex = (runPage - 1) * context.runsPerPage;
  const pageRuns = runs.slice(startIndex, startIndex + context.runsPerPage);
  const showingStart = runs.length === 0 ? 0 : startIndex + 1;
  const showingEnd = Math.min(runs.length, startIndex + pageRuns.length);

  return {
    runPage,
    totalPages,
    html:
      '<div class="runs-table-wrap">' +
        '<table class="runs-table">' +
          '<thead>' +
            '<tr>' +
              '<th>Run</th>' +
              '<th>Status</th>' +
              '<th>Message</th>' +
              '<th>Actions</th>' +
              '<th>Updated</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' +
            pageRuns.map((run) => renderRunsTableRow(run, context)).join("") +
          '</tbody>' +
        '</table>' +
      '</div>' +
      renderRunsPagination(showingStart, showingEnd, runs.length, totalPages, runPage)
  };
}

export function renderGroupedRuns(groups, mode, context) {
  return '<div class="grouped-runs">' + groups.map((group) =>
    '<section class="group">' +
      '<div class="group-head">' +
        "<div>" +
          '<h3 class="text-base font-semibold tracking-[-0.01em]">' + escapeHtml(group.title) + "</h3>" +
          '<p class="muted-copy mt-1 text-sm">' + escapeHtml(groupSummary(group, mode)) + "</p>" +
        "</div>" +
        '<span class="badge-outline">' + group.runs.length + "</span>" +
      "</div>" +
      '<div class="run-grid">' + group.runs.map((run) => renderRunCard(run, mode, context)).join("") + "</div>" +
    "</section>"
  ).join("") + "</div>";
}

function renderRunsTableRow(run, context) {
  const isCapturing = context.captureRunDirectory && run.runDirectory === context.captureRunDirectory;
  const stateLabel = isCapturing
    ? { status: "prepared", label: "Capturing" }
    : runCardState(run);
  const title = run.benchmark?.title ?? run.benchmark?.id ?? run.runner?.metricSource ?? "Untitled run";
  const model = run.model?.id ?? run.runner?.model ?? "Unknown model";
  return (
    '<tr class="run-row" data-open-run data-run-id="' + escapeAttribute(run.runId) + '" tabindex="0" role="button" aria-label="' +
      escapeAttribute(title + " " + model) + '">' +
      '<td>' +
        '<strong class="truncate-line">' + escapeHtml(title) + "</strong>" +
        '<span class="muted-copy truncate-line">' + escapeHtml(model) + "</span>" +
      "</td>" +
      '<td><span class="run-state-pill"><span class="status-dot" data-status="' + escapeAttribute(stateLabel.status) + '"></span>' + escapeHtml(stateLabel.label) + "</span></td>" +
      '<td class="truncate-cell">' + escapeHtml(runCardMediaMessage(run, isCapturing)) + "</td>" +
      '<td>' + renderRunCaptureAction(run, isCapturing, "table", context) + "</td>" +
      '<td class="truncate-cell">' + escapeHtml(formatDateShort(run.updatedAt ?? run.createdAt)) + "</td>" +
    "</tr>"
  );
}

function renderRunCard(run, mode, context) {
  const isCapturing = context.captureRunDirectory && run.runDirectory === context.captureRunDirectory;
  const stateLabel = runCardState(run);
  const identity = runCardIdentity(run, mode);
  return (
    '<article class="run-card" data-open-run data-run-id="' + escapeAttribute(run.runId) + '" tabindex="0" role="button" aria-label="' +
    escapeAttribute(run.benchmark?.title ?? "Run") + " " + escapeAttribute(run.model?.id ?? "") + '">' +
      renderPreview(run, { capturing: isCapturing }) +
      '<span class="run-card-body">' +
        '<span class="run-card-title-row">' +
          '<strong class="truncate-line">' + escapeHtml(identity.primary) + "</strong>" +
          '<span class="muted-copy truncate-line">' + escapeHtml(formatDateShort(run.updatedAt ?? run.createdAt)) + "</span>" +
        "</span>" +
        (identity.secondary ? '<span class="run-card-subtitle truncate-line">' + escapeHtml(identity.secondary) + "</span>" : "") +
        '<span class="run-card-status-row">' +
          '<span class="run-state-pill">' +
            '<span class="status-dot" data-status="' + escapeAttribute(stateLabel.status) + '"></span>' +
            escapeHtml(stateLabel.label) +
          "</span>" +
        "</span>" +
        '<span class="run-card-message truncate-line">' + escapeHtml(runCardMediaMessage(run, isCapturing)) + "</span>" +
        renderRunCaptureAction(run, isCapturing, "card", context) +
      "</span>" +
    "</article>"
  );
}

function renderRunCaptureAction(run, isCapturing, placement, context) {
  const canCapture = context.canOperate &&
    runKind(run) === "visual" &&
    needsMediaCapture(run);
  if (!canCapture) {
    return "";
  }

  const label = "Capture preview";
  const title = run.benchmark?.title ?? run.benchmark?.id ?? "run";
  const model = run.model?.id ?? "unknown model";
  const className = placement === "table" ? "btn-sm-outline run-capture-btn" : "btn-sm-outline run-card-capture";

  return (
    '<span class="run-card-actions" data-placement="' + escapeAttribute(placement) + '">' +
      '<button type="button" class="' + className + ' operational-control" data-capture-run-id="' + escapeAttribute(run.runId) + '" ' +
        'aria-label="' + escapeAttribute(label + " for " + title + " on " + model) + '"' +
        (isCapturing || context.captureBusy ? " disabled" : "") + ">" +
        escapeHtml(isCapturing ? "Capturing..." : label) +
      "</button>" +
    "</span>"
  );
}

function renderRunsPagination(showingStart, showingEnd, totalRuns, totalPages, runPage) {
  return (
    '<div class="runs-pagination" aria-label="Runs pagination">' +
      '<span class="muted-copy text-sm">' +
        "Showing " + String(showingStart) + "-" + String(showingEnd) + " of " + String(totalRuns) +
      "</span>" +
      '<div class="pagination-controls">' +
        '<button type="button" class="btn-sm-outline" id="runsPrevPage" ' + (runPage <= 1 ? "disabled" : "") + ">Previous</button>" +
        '<span class="badge-outline">Page ' + String(runPage) + " of " + String(totalPages) + "</span>" +
        '<button type="button" class="btn-sm-outline" id="runsNextPage" ' + (runPage >= totalPages ? "disabled" : "") + ">Next</button>" +
      "</div>" +
    "</div>"
  );
}

function renderCaptureOverlay(capturing) {
  if (!capturing) {
    return "";
  }

  return '<span class="capture-overlay" aria-live="polite"><span class="capture-spinner" aria-hidden="true"></span><strong>Capturing</strong></span>';
}

function renderPreview(run, options = {}) {
  const previewHref = assetHref(run, run.assets?.preview);
  if (previewHref) {
    return '<span class="preview"><img src="' + escapeAttribute(previewHref) + '" alt="" loading="lazy" />' + renderCaptureOverlay(options.capturing) + '</span>';
  }

  return (
    '<span class="preview">' + renderCaptureOverlay(options.capturing) +
      '<span class="preview-placeholder">' +
        "<strong>" + escapeHtml(run.assets?.html ? "HTML source saved" : "No preview yet") + "</strong>" +
        '<span class="muted-copy max-w-60 text-sm leading-5">' + escapeHtml(run.status === "prepared" ? "Paste the prompt into your tool." : displayRunError(run) ?? "Add preview.png for gallery thumbnails.") + "</span>" +
      "</span>" +
    "</span>"
  );
}

function groupSummary(group, mode) {
  const count = group.subtitles.length;
  const item = mode === "model" ? "prompt" : "model";
  return String(count) + " " + item + (count === 1 ? "" : "s");
}
