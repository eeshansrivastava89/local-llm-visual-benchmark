import { state } from "./state.js";

export function filteredRuns() {
  return state.runs.filter((run) => {
    const workspaceMatch = runKind(run) === "visual";
    const modelMatch = state.selectedModel === "all" || run.model?.id === state.selectedModel;
    const benchmarkMatch = state.selectedBenchmark === "all" || run.benchmark?.id === state.selectedBenchmark;
    const searchMatch = !state.runsSearch.trim() || searchableRunText(run).includes(state.runsSearch.trim().toLowerCase());
    return workspaceMatch && modelMatch && benchmarkMatch && searchMatch;
  });
}

export function groupRuns(runs, titleForRun, subtitleForRun) {
  const groups = new Map();
  for (const run of runs) {
    const title = titleForRun(run);
    const group = groups.get(title) ?? { title, subtitles: new Set(), runs: [] };
    group.subtitles.add(subtitleForRun(run));
    group.runs.push(run);
    groups.set(title, group);
  }
  return Array.from(groups.values()).map((g) => ({
    title: g.title,
    subtitles: Array.from(g.subtitles),
    runs: g.runs
  }));
}

export function modelsFromRuns(runs) {
  return uniqueBy(
    runs
      .map((run) => run.model?.id)
      .filter(Boolean)
      .map((id) => ({ id })),
    (m) => m.id
  );
}

export function runSummaryText(runs) {
  const prepared = runs.filter((r) => r.status === "prepared" && !hasCapturedVideo(r)).length;
  const videoReady = runs.filter((r) => hasCapturedVideo(r)).length;
  const needsCapture = runs.filter((r) => needsMediaCapture(r)).length;
  const failed = runs.filter((r) => r.status === "failed").length;
  if (state.mode === "table") {
    return String(runs.length) + " visual, " + videoReady + " with video, " + needsCapture + " need capture, " + failed + " failed";
  }
  return videoReady + " with video, " + needsCapture + " need capture, " + prepared + " prepared, " + failed + " failed";
}

export function runKind(run) {
  return run.kind ?? "visual";
}

export function runKindLabel(run) {
  return runKind(run) === "visual" ? "Visual" : "Unsupported";
}

export function runnerLabel(run) {
  return run.runner?.actualRunner ?? run.runner?.intendedRunner ?? run.runner?.mode ?? run.tool ?? "manual";
}

export function hasCapturedVideo(run) {
  return Boolean(run.assets?.video || run.assets?.videoMp4);
}

export function needsMediaCapture(run) {
  return Boolean(run.runDirectory && run.assets?.html && (!run.assets?.preview || !hasCapturedVideo(run)));
}

export function runCardState(run) {
  if (hasCapturedVideo(run)) {
    return { status: "completed", label: "video" };
  }
  if (run.status === "failed" || run.status === "cancelled") {
    return { status: run.status, label: run.status };
  }
  if (run.assets?.html) {
    return { status: "prepared", label: "capture" };
  }
  return { status: "prepared", label: "slot" };
}

export function displayRunError(run) {
  const message = run.capture?.video?.error?.message ?? run.error?.message;
  if (!message) return null;
  if (/rendered too slowly/iu.test(message)) return message;
  if (/chat completion timed out/iu.test(message)) return "External tool timed out before writing an artifact.";
  if (/LM Studio.*chat completion/iu.test(message)) return "External tool failed to produce an artifact.";
  if (/LM Studio/iu.test(message)) return "External tool error. Open details for the original message.";
  return message;
}

export function runCardMediaMessage(run, isCapturing) {
  if (isCapturing) return "Capturing preview media";
  if (hasCapturedVideo(run)) return "Video ready";
  if (run.status === "failed" || run.capture?.video?.status === "failed") {
    return displayRunError(run) ?? "Capture failed";
  }
  if (run.assets?.html) return "Needs media capture";
  return "Waiting for index.html source";
}

export function runCardIdentity(run, mode) {
  const promptTitle = run.benchmark?.title ?? run.benchmark?.id ?? "Untitled run";
  const modelId = run.model?.id ?? "Unknown model";

  if (mode === "benchmark") {
    return { primary: modelId, secondary: "" };
  }

  if (mode === "model") {
    return { primary: promptTitle, secondary: "" };
  }

  return { primary: promptTitle, secondary: modelId };
}

export function runRecordText(run) {
  return {
    title: "Prompt",
    value: run.promptText ?? run.benchmark?.prompt ?? "",
    emptyText: "Prompt unavailable in run folder.",
    copyLabel: "Copy prompt"
  };
}

export function canOpenVisualDetail(run) {
  return runKind(run) === "visual" && Boolean(run.assets?.html || run.assets?.preview || hasCapturedVideo(run) || run.status === "prepared");
}

export function findRunByDirectoryOrId(run) {
  return state.runs.find((candidate) =>
    (run.runDirectory && candidate.runDirectory === run.runDirectory) ||
    (run.runId && candidate.runId === run.runId)
  );
}

function searchableRunText(run) {
  return [
    run.runId,
    runKindLabel(run),
    run.status,
    runnerLabel(run),
    run.benchmark?.id,
    run.benchmark?.title,
    run.benchmark?.description,
    run.benchmark?.prompt,
    run.model?.id,
    run.model?.slug,
    run.runner?.backendLabel,
    run.runner?.baseUrl,
    run.runner?.launchCommand,
    run.runner?.metricSource,
    run.runDirectory,
    run.notes,
    ...Object.values(run.assets ?? {})
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function uniqueBy(items, keyForItem) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyForItem(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
