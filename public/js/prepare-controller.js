import { els } from "./dom.js";
import { state } from "./state.js";
import { escapeAttribute, escapeHtml } from "./utils.js";
import { postJson } from "./api.js";
import { benchmarkMatchesKind } from "./runs.js";
import { modelSourceLabel, prepareModelPlaceholder, selectedSourceHealth, updatePrepareModelWarning } from "./setup-ui.js";
import { canUseOperationalControls } from "./operational-controls.js";
import { copyTextToClipboard } from "./clipboard.js";
import { setButtonLabel } from "./icons.js";
import { renderHarnesses, renderModelSources, renderModels, renderRuns } from "./workbench-controller.js";

export function resetPrepareRunModal() {
  state.preparedPrompt = "";
  state.preparedRunDirectory = "";
  els.preparedPrompt.value = "";
  els.preparedPrompt.hidden = true;
  els.prepOutputPlaceholder.hidden = false;
  els.prepOutputPlaceholder.textContent = "Prepare a run slot to generate the prompt for index.html.";
  els.preparedPaths.textContent = "No run slot prepared yet.";
  els.copyPrompt.disabled = true;
  els.copyPreparedPath.disabled = true;

  const prepKindBenchmarks = state.benchmarks.filter((b) => benchmarkMatchesKind(b.id, state.selectedPrepKind));
  if (prepKindBenchmarks[0]) {
    els.prepBenchmark.value = prepKindBenchmarks[0].id;
  }
  if (state.selectedModelSource !== "custom" && state.omlxModels.length === 0 && state.lmStudioModels.length > 0) {
    state.selectedModelSource = "lmstudio";
  }
  els.prepModelSource.value = state.selectedModelSource;
  const firstModel = modelsForSelectedSource()[0]?.id ?? "";
  els.prepModelSelect.value = firstModel;
  updatePrepareMode();

  if (!canUseOperationalControls()) {
    els.prepareRun.disabled = true;
    els.preparedPaths.textContent = "Preparing runs requires the local dev server.";
  } else {
    updatePrepareModelWarning();
  }
}

export function updatePrepareMode() {
  const selectedBenchmark = state.benchmarks.find((b) => b.id === els.prepBenchmark.value);
  const workflow = state.selectedPrepKind;
  const isDs = workflow === "data-science";
  els.prepBackendHelperGroup.hidden = false;
  els.prepModelSourceGroup.hidden = false;
  els.prepVisualPromptGroup.hidden = false;
  els.prepModelSelectGroup.hidden = false;
  els.prepLayout.dataset.kind = workflow;
  els.prepResult.dataset.panelMode = workflow;
  els.preparedPrompt.readOnly = true;
  const isCustom = state.selectedModelSource === "custom";
  els.prepModelSelectGroup.hidden = isCustom;
  els.prepCustomBackendGroup.hidden = !isCustom;
  els.prepCustomModelGroup.hidden = !isCustom;
  els.prepModelSelectLabel.textContent = modelSourceLabel(state.selectedModelSource) + " model";
  if (!state.preparedPrompt) {
    els.preparedPrompt.value = "";
    els.preparedPrompt.hidden = true;
    els.prepOutputPlaceholder.hidden = false;
    updatePreparedCopyState();
  }

  els.prepResultTitle.textContent = "Generated prompt";
  els.prepSubtitle.textContent = isCustom
    ? "Choose a prompt and enter the backend/model labels to generate a manual run folder."
    : "Choose a prompt, model source, model, and harness to generate a run folder.";
  els.prepResultHint.textContent = "Copy this into your selected harness after preparing the slot.";
  els.preparedPrompt.placeholder = isDs
    ? "Prepare a run slot to generate the data-science analysis prompt."
    : "Prepare a run slot to generate the prompt for index.html.";
  els.prepOutputPlaceholder.textContent = isDs
    ? "Prepare a run slot to generate the data-science analysis prompt."
    : "Prepare a run slot to generate the prompt for index.html.";
  els.prepOutputLabel.textContent = isDs ? "Data science prompt" : "Visual prompt";
  setButtonLabel(els.copyPrompt, "Copy prompt", "copy");
  setButtonLabel(els.prepareRun, "Prepare slot", "play");
  updatePrepareModelWarning();
}

export async function prepareRunSlot() {
  if (!canUseOperationalControls()) {
    els.preparedPaths.textContent = "Preparing runs requires the local dev server.";
    return;
  }
  const benchmarkId = els.prepBenchmark.value;
  const modelSource = els.prepModelSource.value;
  const isCustom = modelSource === "custom";
  const selectedBenchmark = state.benchmarks.find((b) => b.id === benchmarkId);
  const isDs = state.selectedPrepKind === "data-science";
  const modelId = isCustom ? els.prepCustomModel.value.trim() : els.prepModelSelect.value.trim();
  if (!benchmarkId || !modelId) {
    updatePrepareModelWarning();
    if (isCustom) {
      els.preparedPaths.textContent = "Enter a custom model name.";
      return;
    }
    const source = state.selectedModelSource;
    const health = selectedSourceHealth();
    els.preparedPaths.textContent = health.status === "offline"
      ? modelSourceLabel(source) + " is offline. Start the server, then refresh models."
      : "Choose a prompt and " + modelSourceLabel(source) + " model.";
    return;
  }
  const runner = els.prepRunner.value;
  const baseUrl = modelSource === "lmstudio" ? els.baseUrl.value : modelSource === "omlx" ? els.omlxBaseUrl.value : undefined;
  const backendLabel = isCustom ? (els.prepCustomBackend.value.trim() || "Custom") : undefined;
  try {
    const data = await postJson("/api/prepare-run", {
      benchmarkId,
      modelId,
      modelSource,
      kind: isDs ? "data-science" : "visual",
      runner,
      baseUrl,
      backendLabel
    });
    const prepared = data.preparedRun;
    const output = prepared.prompt;
    const runDirectory = prepared.paths?.runDirectory ?? prepared.run?.runDirectory ?? "";
    const sourceLabel = isCustom ? backendLabel : modelSourceLabel(modelSource);
    const statusText = "Run slot prepared for " + sourceLabel + " via " + harnessLabel(runner) + ". Run folder: " + runDirectory;
    state.preparedPrompt = output;
    state.preparedRunDirectory = runDirectory;
    els.prepOutputPlaceholder.hidden = true;
    els.preparedPrompt.hidden = false;
    els.preparedPrompt.value = output;
    els.preparedPaths.textContent = statusText;
    els.copyPrompt.disabled = !output;
    els.copyPreparedPath.disabled = !runDirectory;
    updatePreparedCopyState();
    state.runs = [availablePreparedRun(prepared.run), ...state.runs.filter((run) => run.runId !== prepared.run.runId)];
    renderModels();
    renderHarnesses();
    renderModelSources();
    renderPrepOptions();
    renderRuns();
  } catch (error) {
    els.preparedPrompt.value = "";
    els.preparedPrompt.hidden = true;
    els.prepOutputPlaceholder.hidden = false;
    els.preparedPaths.textContent = "Prepare failed: " + error.message;
    state.preparedRunDirectory = "";
    els.copyPrompt.disabled = true;
    els.copyPreparedPath.disabled = true;
    updatePreparedCopyState();
  }
}

function harnessLabel(runner) {
  if (runner === "opencode") return "OpenCode";
  if (runner === "pi") return "Pi";
  if (runner === "hermes") return "Hermes";
  return "manual chat";
}

export async function copyPreparedRunPath() {
  if (!state.preparedRunDirectory) {
    return;
  }
  await copyTextToClipboard(state.preparedRunDirectory, els.copyPreparedPath, "Copy path");
  els.preparedPaths.textContent = "Run folder copied. Open a terminal there, then copy the prompt.";
}

export async function copyPreparedPrompt() {
  if (!els.preparedPrompt.value) {
    return;
  }
  await copyTextToClipboard(els.preparedPrompt.value, els.copyPrompt, "Copy prompt");
  els.preparedPaths.textContent = "Prompt copied.";
}

function updatePreparedCopyState() {
  const value = els.preparedPrompt.value.trim();
  const hasPath = Boolean(state.preparedRunDirectory);
  els.copyPrompt.disabled = !value;
  els.copyPreparedPath.disabled = !hasPath;
}

export function renderPrepOptions() {
  const selectedBenchmark = els.prepBenchmark.value;
  const prepKindBenchmarks = state.benchmarks.filter((b) => benchmarkMatchesKind(b.id, state.selectedPrepKind));
  els.prepBenchmark.innerHTML = prepKindBenchmarks
    .map((b) => '<option value="' + escapeAttribute(b.id) + '">' + escapeHtml(b.title) + "</option>")
    .join("");
  if (prepKindBenchmarks.some((benchmark) => benchmark.id === selectedBenchmark)) {
    els.prepBenchmark.value = selectedBenchmark;
  }
  if (!["omlx", "lmstudio", "custom"].includes(state.selectedModelSource)) {
    state.selectedModelSource = "omlx";
  }
  if (state.selectedModelSource !== "custom" && state.selectedModelSource === "omlx" && state.omlxModels.length === 0 && state.lmStudioModels.length > 0) {
    state.selectedModelSource = "lmstudio";
  }
  els.prepModelSource.value = state.selectedModelSource;
  const sourceModels = modelsForSelectedSource();
  els.prepModelSelect.innerHTML = [
    '<option value="">' + escapeHtml(prepareModelPlaceholder(state.selectedModelSource)) + "</option>",
    ...sourceModels.map((m) => '<option value="' + escapeAttribute(m.id) + '">' + escapeHtml(m.id) + "</option>")
  ].join("");
  if (!sourceModels.some((model) => model.id === els.prepModelSelect.value) && sourceModels[0]) {
    els.prepModelSelect.value = sourceModels[0].id;
  }
  updatePrepareMode();
}

function modelsForSelectedSource() {
  return modelsForSource(state.selectedModelSource);
}

function modelsForSource(source) {
  if (source === "lmstudio") return state.lmStudioModels;
  if (source === "omlx") return state.omlxModels;
  return [];
}

function availablePreparedRun(run) {
  return {
    ...run,
    assets: {
      metadata: run.assets?.metadata ?? "metadata.json",
      ...(run.assets?.prompt ? { prompt: run.assets.prompt } : {})
    }
  };
}

export function renderPrepKindTabs() {
  els.prepKindTabs.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.prepKind === state.selectedPrepKind));
  });
}
