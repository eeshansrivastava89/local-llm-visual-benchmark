import { assetHref } from "./assets.js";
import { compareRunKey, selectedCompareRuns } from "./compare.js";
import { buildPromptStackMatrix, matrixCellLabel } from "./matrix.js";
import { stackAttemptIdentity } from "./runs.js";
import { escapeAttribute, escapeHtml } from "./utils.js";

export function renderCompareRuns(runs, selection) {
  const selectedRuns = selectedCompareRuns(runs, selection);
  return (
    '<div class="grid gap-4">' +
      '<section class="grid gap-3 rounded-lg border bg-card p-3 shadow-sm" aria-label="Compare run selection">' +
        '<div class="flex flex-wrap items-baseline justify-between gap-2">' +
          '<strong>' + String(selectedRuns.length) + " selected</strong>" +
          '<span class="muted-copy text-sm">Choose up to 4 visual runs.</span>' +
        "</div>" +
        '<div class="grid gap-2 md:grid-cols-2">' + runs.map((run) => renderCompareCandidate(run, selection)).join("") + "</div>" +
      "</section>" +
      renderComparePreviewGrid(selectedRuns) +
      renderPromptStackMatrix(runs) +
    "</div>"
  );
}

function renderCompareCandidate(run, selection) {
  const stack = stackAttemptIdentity(run);
  const key = compareRunKey(run);
  const selected = selection.includes(key);
  const title = run.benchmark?.title ?? run.benchmark?.id ?? "Untitled run";
  const label = "Select " + title + " " + stack.label;
  return (
    '<label class="flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors data-[selected=true]:border-accent data-[selected=true]:bg-accent-soft" data-selected="' + String(selected) + '">' +
      '<input type="checkbox" data-compare-select="' + escapeAttribute(key) + '" aria-label="' + escapeAttribute(label) + '" ' + (selected ? "checked" : "") + " />" +
      '<span class="grid min-w-0 gap-0.5">' +
        '<strong class="truncate-line">' + escapeHtml(title) + "</strong>" +
        '<span class="muted-copy truncate-line">' + escapeHtml(stack.label) + "</span>" +
      "</span>" +
    "</label>"
  );
}

function renderComparePreviewGrid(selectedRuns) {
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

function renderPromptStackMatrix(runs) {
  const matrix = buildPromptStackMatrix(runs);
  if (matrix.columns.length === 0 || matrix.rows.length === 0) return "";

  return (
    '<section class="grid gap-3 rounded-lg border bg-card p-3 shadow-sm" aria-label="Filtered prompt stack coverage">' +
      '<div class="flex flex-wrap items-baseline justify-between gap-2">' +
        '<strong>Filtered prompt × stack coverage</strong>' +
        '<span class="muted-copy text-sm">Shows all runs matching the current filters.</span>' +
      "</div>" +
      '<div class="overflow-x-auto">' +
        '<table class="min-w-full border-separate border-spacing-0 text-left text-sm">' +
          '<thead><tr>' +
            '<th class="sticky left-0 z-10 border-b bg-card py-2 pr-3 font-medium">Prompt</th>' +
            matrix.columns.map((column) => '<th class="min-w-44 border-b px-3 py-2 align-bottom font-medium"><span class="line-clamp-2">' + escapeHtml(column.label) + '</span></th>').join("") +
          '</tr></thead>' +
          '<tbody>' + matrix.rows.map((row) => renderPromptStackMatrixRow(row, matrix.columns)).join("") + '</tbody>' +
        '</table>' +
      '</div>' +
    '</section>'
  );
}

function renderPromptStackMatrixRow(row, columns) {
  return (
    '<tr>' +
      '<th class="sticky left-0 z-10 border-b bg-card py-2 pr-3 font-medium">' + escapeHtml(row.title) + '</th>' +
      columns.map((column) => renderPromptStackMatrixCell(row.cells.get(column.key))).join("") +
    '</tr>'
  );
}

function renderPromptStackMatrixCell(cell) {
  const active = Boolean(cell && cell.attempts > 0);
  const className = active
    ? "border-b px-3 py-2 text-foreground"
    : "border-b px-3 py-2 text-muted-foreground";
  return '<td class="' + className + '">' + escapeHtml(matrixCellLabel(cell)) + '</td>';
}
