import { compareRunKey } from "./compare.js";
import { hasCapturedVideo, stackAttemptIdentity } from "./runs.js";

export function buildPromptStackMatrix(runs) {
  const columns = [];
  const rows = [];
  const columnsByKey = new Map();
  const rowsByKey = new Map();

  for (const run of runs) {
    const stack = stackAttemptIdentity(run);
    if (!columnsByKey.has(stack.key)) {
      const column = {
        key: stack.key,
        label: stack.label
      };
      columnsByKey.set(stack.key, column);
      columns.push(column);
    }

    const promptKey = run.benchmark?.id ?? run.benchmark?.title ?? "unknown-prompt";
    if (!rowsByKey.has(promptKey)) {
      const row = {
        key: promptKey,
        title: run.benchmark?.title ?? run.benchmark?.id ?? "Unknown prompt",
        cells: new Map()
      };
      rowsByKey.set(promptKey, row);
      rows.push(row);
    }

    const row = rowsByKey.get(promptKey);
    const cell = row.cells.get(stack.key) ?? {
      runs: [],
      runKeys: [],
      attempts: 0,
      videoReady: 0,
      previewReady: 0,
      latestUpdatedAt: ""
    };
    cell.runs.push(run);
    cell.runKeys.push(compareRunKey(run));
    cell.attempts += 1;
    if (hasCapturedVideo(run)) cell.videoReady += 1;
    if (run.assets?.preview) cell.previewReady += 1;
    if ((run.updatedAt ?? run.createdAt ?? "") > cell.latestUpdatedAt) {
      cell.latestUpdatedAt = run.updatedAt ?? run.createdAt ?? "";
    }
    row.cells.set(stack.key, cell);
  }

  return { columns, rows };
}

export function matrixCellLabel(cell) {
  if (!cell || cell.attempts === 0) return "—";
  const ready = cell.videoReady > 0
    ? `${cell.videoReady} video`
    : cell.previewReady > 0
      ? `${cell.previewReady} preview`
      : "pending";
  return cell.attempts === 1 ? ready : `${ready} / ${cell.attempts} attempts`;
}
