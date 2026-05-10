import { state } from "./state.js";

export function filteredRuns() {
  return state.runs.filter((run) => {
    const sectionMatch = !state.section || state.section === "all" ||
      (state.section === "visual" && runKind(run) !== "lighteval") ||
      (state.section === "quantitative" && runKind(run) === "lighteval");
    const modelMatch = state.selectedModel === "all" || run.model?.id === state.selectedModel;
    const benchmarkMatch = state.selectedBenchmark === "all" || run.benchmark?.id === state.selectedBenchmark;
    const kindMatch = state.selectedKind === "all" || runKind(run) === state.selectedKind;
    const statusMatch = state.selectedStatus === "all" || runDisplayStatus(run) === state.selectedStatus;
    const runnerMatch = state.selectedRunner === "all" || runnerLabel(run) === state.selectedRunner;
    const searchMatch = !state.runsSearch.trim() || searchableRunText(run).includes(state.runsSearch.trim().toLowerCase());
    return sectionMatch && modelMatch && benchmarkMatch && kindMatch && statusMatch && runnerMatch && searchMatch;
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

export function runsForModel(modelId) {
  return state.runs.filter((run) => run.model?.id === modelId);
}

export function runSummaryText(runs) {
  if (state.section === "quantitative") {
    const withResults = runs.filter((r) => runKind(r) === "lighteval" && lightEvalHasOutputs(r)).length;
    const commandOnly = runs.filter((r) =>
      runKind(r) === "lighteval" &&
      !lightEvalHasOutputs(r) &&
      Boolean(r.assets?.command)
    ).length;
    const failed = runs.filter((r) => r.status === "failed").length;
    return withResults + " with results, " + commandOnly + " command only, " + failed + " failed";
  }

  const prepared = runs.filter((r) => r.status === "prepared" && !hasCapturedVideo(r)).length;
  const videoReady = runs.filter((r) => hasCapturedVideo(r)).length;
  const needsCapture = runs.filter((r) => needsMediaCapture(r)).length;
  const failed = runs.filter((r) => r.status === "failed").length;
  if (state.mode === "runs") {
    const visual = runs.filter((r) => runKind(r) === "visual").length;
    const lighteval = runs.filter((r) => runKind(r) === "lighteval").length;
    return String(runs.length) + " total, " + visual + " visual, " + lighteval + " LightEval, " + failed + " failed";
  }
  return videoReady + " with video, " + needsCapture + " need capture, " + prepared + " prepared, " + failed + " failed";
}

export function runKind(run) {
  return run.kind ?? "visual";
}

export function runKindLabel(run) {
  const kind = runKind(run);
  if (kind === "lighteval") return "LightEval";
  if (kind === "visual") return "Visual";
  return kind;
}

export function runnerLabel(run) {
  return run.runner?.actualRunner ?? run.runner?.intendedRunner ?? run.runner?.mode ?? run.tool ?? "manual";
}

export function runDisplayStatus(run) {
  if (run.status === "completed") return "completed";
  return runCardState(run).status ?? run.status ?? "unknown";
}

export function runDisplayStatusLabel(run) {
  const displayStatus = runDisplayStatus(run);
  if (displayStatus === "completed") return "completed";
  return displayStatus;
}

export function hasCapturedVideo(run) {
  return Boolean(run.assets?.video || run.assets?.videoMp4);
}

export function lightEvalHasOutputs(run) {
  return Boolean(run.assets?.lightevalResults || run.assets?.lightevalDetails);
}

export function needsMediaCapture(run) {
  return Boolean(run.runDirectory && run.assets?.html && (!run.assets?.preview || !hasCapturedVideo(run)));
}

export function runCardState(run) {
  if (runKind(run) === "lighteval") {
    if (run.status === "failed" || run.status === "cancelled") {
      return { status: run.status, label: run.status };
    }
    if (lightEvalHasOutputs(run)) {
      return { status: "completed", label: "results" };
    }
    if (run.assets?.command) {
      return { status: "prepared", label: "command" };
    }
    return { status: "prepared", label: "slot" };
  }
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
  if (runKind(run) === "lighteval") {
    if (run.status === "failed" || run.status === "cancelled") {
      return displayRunError(run) ?? "LightEval failed";
    }
    if (lightEvalHasOutputs(run)) return "LightEval results ready";
    if (run.assets?.command) return "Run the saved LightEval command";
    return "Waiting for LightEval outputs";
  }
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
  if (runKind(run) === "lighteval") {
    return {
      title: "Task",
      value: run.benchmark?.prompt ?? run.benchmark?.id ?? "",
      emptyText: "LightEval task unavailable in metadata.",
      copyLabel: "Copy task"
    };
  }

  return {
    title: "Prompt",
    value: run.promptText ?? run.benchmark?.prompt ?? "",
    emptyText: "Prompt unavailable in run folder.",
    copyLabel: "Copy prompt"
  };
}

export function runTaskOrPromptMetaValue(run) {
  return runKind(run) === "lighteval"
    ? (run.benchmark?.prompt ?? run.benchmark?.id ?? run.benchmark?.title)
    : (run.benchmark?.id ?? run.benchmark?.title);
}

export function canOpenVisualDetail(run) {
  return runKind(run) === "visual" || Boolean(run.assets?.html || run.assets?.preview || hasCapturedVideo(run));
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
