import { els } from "./dom.js";
import { state } from "./state.js";
import { escapeHtml, escapeAttribute, formatBytes, uniqueBy } from "./utils.js";
import { fetchJson, fetchStaticManifest, postJson, deleteJson } from "./api.js";
import { compareRunKey, toggleCompareSelection } from "./compare.js";
import { detailActionAvailability, detailViewModel } from "./detail-ui.js";
import { filteredRuns, groupRuns, harnessesFromRuns, modelsFromRuns, runSummaryText, runKind, hasCapturedVideo, needsMediaCapture, findRunByDirectoryOrId } from "./runs.js";
import { renderGroupedRuns as renderGroupedRunsMarkup, renderRunsTable as renderRunsTableMarkup } from "./workbench-ui.js";
import { openModal, closeModal, currentModal, handleModalKeydown } from "./modals.js";
import { applyStoredTheme, toggleTheme, setTheme } from "./theme.js";
import { startHtmlPolling } from "./polling.js";
import {
  initSourceStatuses,
  modelSourceLabel,
  prepareModelPlaceholder,
  renderModelInventory,
  selectedSourceHealth,
  setSourceStatus,
  sourceStatusMessage,
  updateConfigPresence,
  updateLmStepStates,
  updatePrepareModelWarning,
  updateSyncButtons
} from "./setup-ui.js";
import { wireHelpTooltips } from "./tooltips.js";
import { renderViewTabs, updateOnboarding, showHtmlDetectToast } from "./ui.js";

init();

function init() {
  initWorkspaceState();
  applyStoredTheme();
  wireEvents();
  initSourceStatuses();
  renderViewTabs();
  updateOnboarding();
  void loadLocalData();
  setInterval(() => {
    if (!state.staticMode) {
      void loadStats();
    }
  }, 5000);
  setInterval(() => {
    if (!state.staticMode) {
      if (state.omlxConnected) void loadOmlxModels();
      if (state.lmConnected) void loadModels();
    }
  }, 60000);
  setInterval(() => {
    if (!state.staticMode) {
      void loadModelSyncState();
    }
  }, 12000);
}

function initWorkspaceState() {
  state.workspace = "visual";
  state.mode = "benchmark";
}

function wireEvents() {
  els.refreshOmlx.addEventListener("click", () => loadOmlxModels({ manual: true }));
  els.refreshConnection.addEventListener("click", () => loadConnection({ manual: true }));
  els.refreshRuns.addEventListener("click", () => refreshAndCaptureMissing());
  els.syncPiBtn.addEventListener("click", () => syncModels(["pi"]));
  els.syncOpenCodeBtn.addEventListener("click", () => syncModels(["opencode"]));

  els.themeToggle.addEventListener("click", () => toggleTheme());
  els.setupToggle.addEventListener("click", () => openModal("setup"));
  els.runToggle.addEventListener("click", () => {
    openModal("prep");
    resetPrepareRunModal();
  });

  els.closeDetail.addEventListener("click", () => closeModal("detail"));
  els.closePrep.addEventListener("click", () => closeModal("prep"));
  els.closeSetup.addEventListener("click", () => closeModal("setup"));
  els.closeDeleteConfirm.addEventListener("click", () => closeModal("deleteConfirm"));
  els.cancelDeleteRun.addEventListener("click", () => closeModal("deleteConfirm"));
  els.confirmDeleteRun.addEventListener("click", () => confirmDeleteSelectedRun());
  document.addEventListener("keydown", handleModalKeydown);
  wireHelpTooltips();

  els.detailBackdrop.addEventListener("click", (event) => {
    if (event.target === els.detailBackdrop) closeModal("detail");
  });
  els.prepBackdrop.addEventListener("click", (event) => {
    if (event.target === els.prepBackdrop) closeModal("prep");
  });
  els.setupBackdrop.addEventListener("click", (event) => {
    if (event.target === els.setupBackdrop) closeModal("setup");
  });
  els.deleteConfirmBackdrop.addEventListener("click", (event) => {
    if (event.target === els.deleteConfirmBackdrop) closeModal("deleteConfirm");
  });

  els.deleteRun.addEventListener("click", () => requestDeleteSelectedRun());
  els.openHtml.addEventListener("click", () => openSelectedRunHtml());
  els.copyDetailPath.addEventListener("click", () => copySelectedRunPath());
  els.openRunFolder.addEventListener("click", () => openSelectedRunFolder(els.openRunFolder, els.detailMeta));
  els.recaptureRun.addEventListener("click", () => captureSelectedRunMedia({ force: true }));
  els.copyDetailPrompt.addEventListener("click", () => copyDetailPrompt());

  els.modelFilter.addEventListener("change", () => {
    state.selectedModel = els.modelFilter.value;
    resetRunPage();
    renderRuns();
  });
  els.benchmarkFilter.addEventListener("change", () => {
    state.selectedBenchmark = els.benchmarkFilter.value;
    resetRunPage();
    renderRuns();
  });
  els.harnessFilter.addEventListener("change", () => {
    state.selectedHarness = els.harnessFilter.value;
    resetRunPage();
    renderRuns();
  });
  els.runsSearch.addEventListener("input", () => {
    state.runsSearch = els.runsSearch.value;
    resetRunPage();
    renderRuns();
  });
  els.prepareRun.addEventListener("click", () => prepareRunSlot());
  els.copyPreparedPath.addEventListener("click", () => copyPreparedRunPath());
  els.copyPrompt.addEventListener("click", () => copyPreparedPrompt());
  els.prepRunner.addEventListener("change", () => updatePrepareMode());
  els.prepModelSource.addEventListener("change", () => {
    state.selectedModelSource = els.prepModelSource.value;
    renderPrepOptions();
  });
  els.prepBenchmark.addEventListener("change", () => updatePrepareMode());
  els.prepModelSelect.addEventListener("change", () => {
    updatePrepareMode();
  });

  els.viewTabs.forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      resetRunPage();
      renderViewTabs();
      renderRuns();
    });
  });

  if (els.dismissOnboarding) {
    els.dismissOnboarding.addEventListener("click", () => {
      state.onboardingDismissed = true;
      try { localStorage.setItem("onboardingDismissed", "1"); } catch {}
      if (els.onboardingPanel) els.onboardingPanel.hidden = true;
    });
  }

  document.addEventListener("capture-pending", () => {
    void captureMissingMedia();
  });
}

/* ── Sync action ──────────────────────────────────────────── */

async function syncModels(targets) {
  if (state.staticMode) {
    els.syncMessage.textContent = "Sync requires the local dev server.";
    return;
  }

  const discoveredIds = state.lmStudioModels
    .map((m) => m.id)
    .filter((id) => typeof id === "string" && id.length > 0);

  if (discoveredIds.length === 0) {
    els.syncMessage.textContent = "No discovered LM Studio models to sync.";
    return;
  }

  state.syncBusy = true;
  updateSyncButtons();

  const targetLabels = { pi: "Pi", opencode: "OpenCode" };
  const label = targets.map((t) => targetLabels[t] ?? t).join(" + ");
  els.syncMessage.textContent = "Syncing to " + label + "…";

  try {
    const data = await postJson("/api/model-sync", {
      baseUrl: els.baseUrl.value,
      modelIds: discoveredIds,
      targets
    });
    state.modelSync = data.sync ?? state.modelSync;
    updateConfigPresence();
    renderModelInventory();
    els.syncMessage.textContent =
      "Synced " + String(data.mirroredModelCount ?? discoveredIds.length) +
      " model" + (discoveredIds.length === 1 ? "" : "s") +
      " to " + label + ".";
  } catch (error) {
    els.syncMessage.textContent = "Sync failed: " + error.message;
  } finally {
    state.syncBusy = false;
    updateSyncButtons();
  }
}

/* ── Data loading ────────────────────────────────────────── */

async function loadLocalData() {
  try {
    const [benchmarks, runs] = await Promise.all([
      fetchJson("/api/benchmarks"),
      fetchJson("/api/runs")
    ]);
    state.staticMode = false;
    state.benchmarks = benchmarks.benchmarks ?? [];
    state.runs = runs.runs ?? [];
    renderBenchmarks();
    renderModels();
    renderHarnesses();
    renderModelSources();
    renderRuns();
    renderPrepOptions();
    startHtmlPolling({
      onRefresh: refreshRunsForPolling,
      onDetect: showHtmlDetectToast
    });
    await Promise.allSettled([loadOmlxModels(), loadConnection(), loadStats(), loadModelSyncState()]);
  } catch (error) {
    await enterStaticMode(error);
  }
}

async function enterStaticMode(reason) {
  try {
    const manifest = await fetchStaticManifest();
    state.staticMode = true;
    state.benchmarks = manifest.benchmarks ?? [];
    state.runs = manifest.runs ?? [];
    state.discoveredModels = [];
    state.omlxModels = [];
    state.lmStudioModels = [];
    state.omlxConnected = false;
    state.lmConnected = false;
    state.writesEnabled = false;
    setSourceStatus("omlx", "static", 0, "oMLX status requires the local dev server.");
    setSourceStatus("lmstudio", "static", 0, "LM Studio status requires the local dev server.");
    setConnectionMessage("Browsing exported runs. Sync requires the local dev server.");
    els.statsDot.dataset.state = "static";
    els.statsCompact.textContent = "Static";
    renderBenchmarks();
    renderModels();
    renderHarnesses();
    renderModelSources();
    renderPrepOptions();
    renderRuns();
    updateOnboarding();
    updateLmStepStates();
    updateWriteControls();
  } catch (staticError) {
    setConnectionMessage((reason?.message ?? "Local API unavailable.") + " " + staticError.message);
    els.statsDot.dataset.state = "offline";
    els.statsCompact.textContent = "Unavailable";
    els.runsSurface.innerHTML = '<div class="empty">No local API or static export was found.</div>';
  }
}

async function loadConnection(options = {}) {
  setSourceStatus("lmstudio", "checking", state.lmStudioModels.length, "Checking LM Studio model server.");
  if (options.manual) {
    els.refreshConnection.disabled = true;
    els.refreshConnection.textContent = "Refreshing…";
    els.connectionMessage.textContent = "Checking LM Studio and refreshing models…";
  }

  try {
    const status = await fetchJson("/api/status?baseUrl=" + encodeURIComponent(els.baseUrl.value));
    if (status.lmStudio?.baseUrl) {
      els.baseUrl.value = status.lmStudio.baseUrl;
    }
    if (typeof status.app?.writesEnabled === "boolean") {
      state.writesEnabled = status.app.writesEnabled;
      updateWriteControls();
    }
    const connection = status.lmStudio?.connection;
    if (connection?.ok) {
      state.lmConnected = true;
      const modelCount = await loadModels();
      await loadModelSyncState();
      els.connectionMessage.textContent = "LM Studio is reachable. " + modelCount + " " + (modelCount === 1 ? "model" : "models") + " discovered.";
    } else {
      state.lmConnected = false;
      const message = connection?.error ?? "LM Studio is not reachable.";
      els.connectionMessage.textContent = message;
      state.lmStudioModels = [];
      setSourceStatus("lmstudio", "offline", 0, "LM Studio is not reachable. Start LM Studio's local server, then refresh. " + message);
      updateDiscoveredModels();
      renderModelSources();
      renderPrepOptions();
      await loadModelSyncState();
    }
  } catch (error) {
    state.lmConnected = false;
    els.connectionMessage.textContent = error.message;
    state.lmStudioModels = [];
    setSourceStatus("lmstudio", "offline", 0, "LM Studio is not reachable. Start LM Studio's local server, then refresh. " + error.message);
    updateDiscoveredModels();
    renderModelSources();
    renderPrepOptions();
  } finally {
    updateLmStepStates();
    updateConfigPresence();
    updateSyncButtons();
    if (options.manual) {
      els.refreshConnection.disabled = false;
      els.refreshConnection.textContent = "Refresh";
    }
  }
}

async function loadOmlxModels(options = {}) {
  setSourceStatus("omlx", "checking", state.omlxModels.length, "Checking oMLX model server.");
  if (options.manual) {
    els.refreshOmlx.disabled = true;
    els.refreshOmlx.textContent = "Refreshing…";
    els.omlxConnectionMessage.textContent = "Checking oMLX and refreshing models…";
  }

  try {
    const data = await fetchJson("/api/omlx/models?baseUrl=" + encodeURIComponent(els.omlxBaseUrl.value));
    if (data.baseUrl) {
      els.omlxBaseUrl.value = data.baseUrl;
    }
    const discovered = (data.models ?? []).map((model) => ({
      ...model,
      source: "omlx"
    }));
    state.omlxConnected = true;
    state.omlxModels = discovered;
    setSourceStatus(
      "omlx",
      "online",
      discovered.length,
      sourceStatusMessage("omlx", "online", discovered.length)
    );
    updateDiscoveredModels();
    renderModelSources();
    renderPrepOptions();
    els.omlxConnectionMessage.textContent =
      "oMLX is reachable. " + discovered.length + " " + (discovered.length === 1 ? "model" : "models") + " discovered.";
    return discovered.length;
  } catch (error) {
    state.omlxConnected = false;
    state.omlxModels = [];
    setSourceStatus("omlx", "offline", 0, "oMLX is not reachable. Start the oMLX server, then refresh. " + error.message);
    updateDiscoveredModels();
    renderModelSources();
    renderPrepOptions();
    els.omlxConnectionMessage.textContent = "oMLX unavailable: " + error.message;
    return 0;
  } finally {
    if (options.manual) {
      els.refreshOmlx.disabled = false;
      els.refreshOmlx.textContent = "Refresh";
    }
  }
}

async function loadModels() {
  try {
    const data = await fetchJson("/api/lmstudio/models?baseUrl=" + encodeURIComponent(els.baseUrl.value));
    const discovered = (data.models ?? []).map((model) => ({
      ...model,
      source: "lmstudio"
    }));
    state.lmStudioModels = discovered;
    setSourceStatus(
      "lmstudio",
      "online",
      discovered.length,
      sourceStatusMessage("lmstudio", "online", discovered.length)
    );
    updateDiscoveredModels();
    renderModelSources();
    renderPrepOptions();
    updateLmStepStates();
    updateSyncButtons();
    return discovered.length;
  } catch (error) {
    state.lmConnected = false;
    state.lmStudioModels = [];
    setSourceStatus("lmstudio", "offline", 0, "LM Studio is not reachable. Start LM Studio's local server, then refresh. " + error.message);
    updateDiscoveredModels();
    renderModelSources();
    renderPrepOptions();
    updateLmStepStates();
    updateSyncButtons();
    return 0;
  }
}

function updateDiscoveredModels() {
  state.discoveredModels = [...state.omlxModels, ...state.lmStudioModels];
  updateOnboarding();
}

async function loadModelSyncState() {
  if (state.staticMode) {
    state.modelSync.enabled = false;
    updateLmStepStates();
    updateConfigPresence();
    updateSyncButtons();
    return;
  }

  try {
    const data = await fetchJson("/api/model-sync");
    state.modelSync = data.sync ?? state.modelSync;
    updateLmStepStates();
    updateConfigPresence();
    updateSyncButtons();
    renderModelSources();
  } catch (error) {
    state.modelSync.enabled = false;
    updateLmStepStates();
    updateConfigPresence();
    els.syncMessage.textContent = "Sync unavailable: " + error.message;
    updateSyncButtons();
  }
}

async function loadStats() {
  try {
    const data = await fetchJson("/api/system-stats");
    state.stats = data.stats;
    const cpu = Number.isFinite(state.stats?.cpu?.usagePercent)
      ? state.stats.cpu.usagePercent.toFixed(1) + "% CPU"
      : (state.stats?.cpu?.cores ?? "-") + " cores";
    const memory = formatBytes(state.stats?.memory?.usedBytes) + " / " + formatBytes(state.stats?.memory?.totalBytes);
    els.statsDot.dataset.state = "online";
    els.statsCompact.textContent = cpu + " · " + memory;
  } catch (error) {
    els.statsDot.dataset.state = "offline";
    els.statsCompact.textContent = error.message;
  }
}

async function refreshAndCaptureMissing() {
  const refreshed = await refreshRuns();
  if (refreshed) {
    await captureMissingMedia({ afterRefresh: true });
  }
}

async function refreshRuns() {
  if (state.staticMode) {
    await enterStaticMode(new Error("Static refresh"));
    return false;
  }

  state.refreshBusy = true;
  updateWriteControls();
  els.refreshRuns.textContent = "Refreshing…";
  els.runSummary.textContent = "Refreshing saved runs…";

  try {
    const [benchmarks, runs] = await Promise.all([
      fetchJson("/api/benchmarks"),
      fetchJson("/api/runs")
    ]);
    state.benchmarks = benchmarks.benchmarks ?? [];
    state.runs = runs.runs ?? [];
    syncSelectedRunFromState({ rerenderDetail: true });
    renderBenchmarks();
    renderModels();
    renderHarnesses();
    renderModelSources();
    renderPrepOptions();
    renderRuns();
    return true;
  } catch (error) {
    els.runSummary.textContent = "Refresh failed: " + error.message;
    return false;
  } finally {
    state.refreshBusy = false;
    els.refreshRuns.textContent = "Refresh & capture missing";
    updateWriteControls();
  }
}

async function refreshRunsForPolling() {
  if (state.staticMode || state.captureBusy) {
    return;
  }

  const runs = await fetchJson("/api/runs");
  state.runs = runs.runs ?? [];
  syncSelectedRunFromState({ rerenderDetail: currentModal() === "detail" });
  renderModels();
  renderHarnesses();
  renderModelSources();
  renderRuns();
  updateOnboarding();
}

async function captureMissingMedia(options = {}) {
  if (!canUseOperationalControls() || state.captureBusy) {
    els.runSummary.textContent = "Capture requires the local dev server.";
    return;
  }

  const queue = state.runs.filter((run) => needsMediaCapture(run));
  if (queue.length === 0) {
    els.runSummary.textContent = options.afterRefresh
      ? "Refreshed. No runs need media capture."
      : "No runs need media capture.";
    return;
  }

  state.captureBusy = true;
  updateWriteControls();

  let captured = 0;
  let skipped = 0;
  let failed = 0;

  try {
    for (const [index, run] of queue.entries()) {
      state.captureRunDirectory = run.runDirectory ?? "";
      renderRuns();
      els.runSummary.textContent =
        "Capturing " + String(index + 1) + "/" + String(queue.length) + ": " +
        (run.benchmark?.title ?? run.benchmark?.id ?? "Untitled run");

      const data = await postJson("/api/capture-media", {
        runDirectory: run.runDirectory
      });
      captured += Number(data.captured ?? 0);
      skipped += Number(data.skipped ?? 0);
      failed += Number(data.failed ?? 0);
      state.runs = data.runs ?? state.runs;
    }

    state.captureRunDirectory = "";
    renderModels();
    renderHarnesses();
    renderModelSources();
    renderPrepOptions();
    renderRuns();
    els.runSummary.textContent =
      "Captured " + String(captured) +
      ", skipped " + String(skipped) +
      ", failed " + String(failed) + ".";
  } catch (error) {
    state.captureRunDirectory = "";
    renderRuns();
    els.runSummary.textContent = "Capture failed: " + error.message;
  } finally {
    state.captureBusy = false;
    updateWriteControls();
  }
}

function syncSelectedRunFromState(options = {}) {
  if (!state.selectedRun) {
    return;
  }

  const nextRun = findRunByDirectoryOrId(state.selectedRun);
  if (!nextRun) {
    return;
  }

  state.selectedRun = nextRun;
  if (options.rerenderDetail) {
    renderDetail(nextRun);
  } else {
    updateDetailActions(nextRun);
  }
}

function updateWriteControls() {
  const canWrite = canUseOperationalControls();
  syncOperationalControls();
  els.refreshRuns.disabled = !canWrite || state.refreshBusy || state.captureBusy;
  els.refreshRuns.title = "Reload saved runs from disk, then capture preview/video for runs missing media.";
  if (state.selectedRun) {
    updateDetailActions(state.selectedRun);
  }
}

function canUseOperationalControls() {
  return !state.staticMode && state.writesEnabled;
}

function syncOperationalControls() {
  const canShow = canUseOperationalControls();
  document.querySelectorAll(".operational-control").forEach((control) => {
    const available = control.dataset.operationalAvailable !== "false";
    control.hidden = !(canShow && available);
  });
}

function setOperationalAvailability(control, available) {
  if (control) {
    control.dataset.operationalAvailable = available ? "true" : "false";
  }
}

async function captureSelectedRunMedia(options = {}) {
  const run = state.selectedRun;
  if (!run) {
    return;
  }

  await captureRunMedia(run, options);
}

async function captureRunMedia(run, options = {}) {
  if (!run?.runDirectory || !canUseOperationalControls() || state.captureBusy) {
    return;
  }

  const wasSelected = state.selectedRun &&
    ((state.selectedRun.runDirectory && state.selectedRun.runDirectory === run.runDirectory) ||
      (state.selectedRun.runId && state.selectedRun.runId === run.runId));

  state.captureBusy = true;
  state.captureRunDirectory = run.runDirectory;
  updateWriteControls();
  renderRuns();
  if (wasSelected) {
    els.recaptureRun.textContent = "Capturing…";
  }

  try {
    const data = await postJson("/api/capture-media", {
      runDirectory: run.runDirectory,
      force: Boolean(options.force)
    });
    state.runs = data.runs ?? state.runs;
    const nextRun = findRunByDirectoryOrId(run) ?? run;
    if (wasSelected) {
      state.selectedRun = nextRun;
    }
    renderModels();
    renderHarnesses();
    renderModelSources();
    renderPrepOptions();
    renderRuns();
    updateOnboarding();
    if (wasSelected) {
      renderDetail(nextRun);
    }
  } catch (error) {
    if (wasSelected) {
      els.detailMeta.innerHTML +=
        '<span class="meta-label">Capture</span><strong>' + escapeHtml(error.message) + "</strong>";
    } else {
      els.runSummary.textContent = "Capture failed: " + error.message;
    }
  } finally {
    state.captureBusy = false;
    state.captureRunDirectory = "";
    renderRuns();
    if (wasSelected && state.selectedRun) {
      renderDetail(state.selectedRun);
    }
    updateWriteControls();
  }
}

function resetPrepareRunModal() {
  state.preparedPrompt = "";
  state.preparedRunDirectory = "";
  els.preparedPrompt.value = "";
  els.preparedPaths.textContent = "No run slot prepared yet.";
  els.copyPrompt.disabled = true;
  els.copyPreparedPath.disabled = true;

  if (state.benchmarks[0]) {
    els.prepBenchmark.value = state.benchmarks[0].id;
  }
  if (state.omlxModels.length === 0 && state.lmStudioModels.length > 0) {
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

function updatePrepareMode() {
  const workflow = "visual";
  els.prepBackendHelperGroup.hidden = false;
  els.prepModelSourceGroup.hidden = false;
  els.prepVisualPromptGroup.hidden = false;
  els.prepModelSelectGroup.hidden = false;
  els.prepLayout.dataset.kind = workflow;
  els.prepResult.dataset.panelMode = workflow;
  els.preparedPrompt.readOnly = true;
  els.prepModelSelectLabel.textContent = modelSourceLabel(state.selectedModelSource) + " model";
  if (!state.preparedPrompt) {
    els.preparedPrompt.value = "";
    updatePreparedCopyState();
  }

  els.prepResultTitle.textContent = "Generated prompt";
  els.prepSubtitle.textContent = "Choose a prompt, model source, model, and harness to generate a run folder.";
  els.prepResultHint.textContent = "Copy this into your selected harness after preparing the slot.";
  els.preparedPrompt.placeholder = "Prepare a run slot to generate the prompt for index.html.";
  els.prepOutputLabel.textContent = "Visual prompt";
  els.copyPrompt.textContent = "Copy prompt";
  els.prepareRun.textContent = "Prepare slot";
  updatePrepareModelWarning();
}

async function prepareRunSlot() {
  if (!canUseOperationalControls()) {
    els.preparedPaths.textContent = "Preparing runs requires the local dev server.";
    return;
  }
  const benchmarkId = els.prepBenchmark.value;
  const modelId = els.prepModelSelect.value.trim();
  if (!benchmarkId || !modelId) {
    updatePrepareModelWarning();
    const source = state.selectedModelSource;
    const health = selectedSourceHealth();
    els.preparedPaths.textContent = health.status === "offline"
      ? modelSourceLabel(source) + " is offline. Start the server, then refresh models."
      : "Choose a prompt and " + modelSourceLabel(source) + " model.";
    return;
  }
  const runner = els.prepRunner.value;
  const modelSource = els.prepModelSource.value;
  const baseUrl = modelSource === "lmstudio" ? els.baseUrl.value : els.omlxBaseUrl.value;
  try {
    const data = await postJson("/api/prepare-run", {
      benchmarkId,
      modelId,
      modelSource,
      kind: "visual",
      runner,
      baseUrl
    });
    const prepared = data.preparedRun;
    const output = prepared.prompt;
    const runDirectory = prepared.paths?.runDirectory ?? prepared.run?.runDirectory ?? "";
    const statusText = "Run slot prepared for " + modelSourceLabel(modelSource) + " via " + harnessLabel(runner) + ". Run folder: " + runDirectory;
    state.preparedPrompt = output;
    state.preparedRunDirectory = runDirectory;
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

async function copyPreparedRunPath() {
  if (!state.preparedRunDirectory) {
    return;
  }
  await copyTextToClipboard(state.preparedRunDirectory, els.copyPreparedPath, "Copy path");
  els.preparedPaths.textContent = "Run folder copied. Open a terminal there, then copy the prompt.";
}

async function copyPreparedPrompt() {
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

async function copyDetailPrompt() {
  const text = els.detailPrompt.textContent ?? "";
  await copyTextToClipboard(text, els.copyDetailPrompt, "Copy prompt");
}

async function copyTextToClipboard(text, button, label) {
  if (!text) {
    return;
  }

  await navigator.clipboard.writeText(text);
  if (!button) {
    return;
  }

  button.textContent = "Copied";
  window.setTimeout(() => {
    button.textContent = label;
  }, 1200);
}

function requestDeleteSelectedRun() {
  const run = state.selectedRun;
  if (!run?.runDirectory || !canUseOperationalControls()) {
    return;
  }

  els.deleteRunPath.textContent = run.runDirectory;
  openModal("deleteConfirm");
}

async function confirmDeleteSelectedRun() {
  const run = state.selectedRun;
  if (!run?.runDirectory || !canUseOperationalControls()) {
    closeModal("deleteConfirm");
    return;
  }

  els.confirmDeleteRun.disabled = true;
  if (els.deleteRun) els.deleteRun.disabled = true;
  try {
    await deleteJson("/api/runs", { runDirectory: run.runDirectory });
    state.runs = state.runs.filter((item) => item.runDirectory !== run.runDirectory);
    closeModal("deleteConfirm");
    closeModal("detail");
    state.selectedRun = null;
    renderModels();
    renderHarnesses();
    renderModelSources();
    renderPrepOptions();
    renderRuns();
  } catch (error) {
    window.alert("Delete failed: " + error.message);
  } finally {
    els.confirmDeleteRun.disabled = false;
    if (els.deleteRun) els.deleteRun.disabled = false;
  }
}

async function openSelectedRunHtml() {
  const run = state.selectedRun;
  if (!run?.runDirectory || !run.assets?.html || !canUseOperationalControls()) {
    return;
  }

  els.openHtml.disabled = true;
  try {
    await postJson("/api/open-html", {
      runDirectory: run.runDirectory,
      asset: run.assets.html
    });
  } catch (error) {
    els.detailMeta.innerHTML +=
      '<span class="meta-label">Open HTML</span><strong>' + escapeHtml(error.message) + "</strong>";
  } finally {
    updateDetailActions(run);
  }
}

async function copySelectedRunPath() {
  const run = state.selectedRun;
  if (!run?.runDirectory) {
    return;
  }

  await copyTextToClipboard(run.runDirectory, els.copyDetailPath, "Copy path");
}

async function openSelectedRunFolder(button = els.openRunFolder, errorTarget = els.detailMeta) {
  const run = state.selectedRun;
  if (!run?.runDirectory || !canUseOperationalControls()) {
    return;
  }

  button.disabled = true;
  try {
    await postJson("/api/open-run-folder", {
      runDirectory: run.runDirectory
    });
  } catch (error) {
    errorTarget.innerHTML +=
      '<span class="meta-label">Open folder</span><strong>' + escapeHtml(error.message) + "</strong>";
  } finally {
    updateDetailActions(run);
  }
}

/* ── Rendering ────────────────────────────────────────────── */

function runsForCurrentWorkspace() {
  return state.runs.filter((run) => runKind(run) === "visual");
}

function renderBenchmarks() {
  const allLabel = "All prompts";
  const optionRuns = runsForCurrentWorkspace();
  const runOptions = optionRuns
    .map((run) => ({
      id: run.benchmark?.id,
      label: run.benchmark?.title ?? run.benchmark?.id
    }))
    .filter((item) => item.id && item.label);
  const benchmarkOptions = state.benchmarks.map((benchmark) => ({ id: benchmark.id, label: benchmark.title }));
  const options = uniqueBy([...benchmarkOptions, ...runOptions], (item) => item.id);
  if (state.selectedBenchmark !== "all" && !options.some((option) => option.id === state.selectedBenchmark)) {
    state.selectedBenchmark = "all";
  }
  els.benchmarkFilter.innerHTML = [
    '<option value="all">' + escapeHtml(allLabel) + "</option>",
    ...options.map((option) =>
      '<option value="' + escapeAttribute(option.id) + '">' + escapeHtml(option.label) + "</option>"
    )
  ].join("");
  els.benchmarkFilter.value = state.selectedBenchmark;
}

function renderModels() {
  const runModels = modelsFromRuns(runsForCurrentWorkspace());
  if (state.selectedModel !== "all" && !runModels.some((m) => m.id === state.selectedModel)) {
    state.selectedModel = "all";
    els.modelFilter.value = "all";
  }
  els.modelFilter.innerHTML = [
    '<option value="all">All run models</option>',
    ...runModels.map((m) =>
      '<option value="' + escapeAttribute(m.id) + '">' + escapeHtml(m.id) + "</option>"
    )
  ].join("");
  els.modelFilter.value = state.selectedModel;
}

function renderHarnesses() {
  const runHarnesses = harnessesFromRuns(runsForCurrentWorkspace());
  if (state.selectedHarness !== "all" && !runHarnesses.some((harness) => harness.id === state.selectedHarness)) {
    state.selectedHarness = "all";
    els.harnessFilter.value = "all";
  }
  els.harnessFilter.innerHTML = [
    '<option value="all">All harnesses</option>',
    ...runHarnesses.map((harness) =>
      '<option value="' + escapeAttribute(harness.id) + '">' + escapeHtml(harness.id) + "</option>"
    )
  ].join("");
  els.harnessFilter.value = state.selectedHarness;
}

function renderModelSources() {
  renderModelInventory();
}

function renderPrepOptions() {
  const selectedBenchmark = els.prepBenchmark.value;
  els.prepBenchmark.innerHTML = state.benchmarks
    .map((b) => '<option value="' + escapeAttribute(b.id) + '">' + escapeHtml(b.title) + "</option>")
    .join("");
  if (state.benchmarks.some((benchmark) => benchmark.id === selectedBenchmark)) {
    els.prepBenchmark.value = selectedBenchmark;
  }
  if (!["omlx", "lmstudio"].includes(state.selectedModelSource)) {
    state.selectedModelSource = "omlx";
  }
  if (state.selectedModelSource === "omlx" && state.omlxModels.length === 0 && state.lmStudioModels.length > 0) {
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
  return source === "lmstudio"
    ? state.lmStudioModels
    : state.omlxModels;
}

function resetRunPage() {
  state.runPage = 1;
}

function renderRuns() {
  const runs = filteredRuns();
  els.runCount.textContent = String(runs.length);
  els.runSummary.textContent = runSummaryText(runs);
  els.viewTitle.textContent = state.mode === "model"
    ? "Model attempts"
    : state.mode === "table"
    ? "Table"
    : state.mode === "benchmark"
      ? "Prompt comparison"
      : "Prompt comparison";
  els.viewSubtitle.textContent = state.mode === "model"
    ? "Group attempts by model and prompt."
    : state.mode === "table"
    ? "Select table rows to compare visual outputs."
    : state.mode === "benchmark"
      ? "Compare one prompt across models."
      : "Compare one prompt across models.";

  if (runs.length === 0) {
    const emptyBase = '<div class="empty">No runs match the current filters.</div>';
    const emptyWithAction = !canUseOperationalControls()
      ? emptyBase
      : '<div class="empty">No runs match the current filters.<div class="empty-state-action"><button type="button" class="btn-sm-ghost" id="emptyPrepRun">Prepare a run</button></div></div>';
    els.runsSurface.innerHTML = emptyWithAction;
    const emptyPrep = document.querySelector("#emptyPrepRun");
    if (emptyPrep) {
      emptyPrep.addEventListener("click", () => openModal("prep"));
    }
    return;
  }

  if (state.mode === "table") {
    renderRunsTable(runs);
    return;
  }

  if (state.mode === "model") {
    renderGroupedRuns(
      groupRuns(runs, (r) => r.model?.id ?? "Unknown model", (r) => r.benchmark?.title ?? r.benchmark?.id ?? "Unknown prompt"),
      "model"
    );
    return;
  }

  if (state.mode === "benchmark") {
    renderGroupedRuns(
      groupRuns(runs, (r) => r.benchmark?.title ?? r.benchmark?.id ?? "Unknown prompt", (r) => r.model?.id ?? "Unknown model"),
      "benchmark"
    );
    return;
  }
  renderGroupedRuns(
    groupRuns(runs, (r) => r.benchmark?.title ?? r.benchmark?.id ?? "Unknown prompt", (r) => r.model?.id ?? "Unknown model"),
    "benchmark"
  );
}

function wireCompareSelection(runs) {
  document.querySelectorAll("[data-compare-select]").forEach((input) => {
    input.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
    });
    input.addEventListener("change", (event) => {
      event.stopPropagation();
      const run = runs.find((candidate) => compareRunKey(candidate) === input.dataset.compareSelect);
      state.compareSelection = toggleCompareSelection(state.compareSelection, run);
      renderRuns();
    });
  });
}

function renderRunsTable(runs) {
  const rendered = renderRunsTableMarkup(runs, workbenchRenderContext());
  state.runPage = rendered.runPage;
  els.runsSurface.innerHTML = rendered.html;
  wireCompareSelection(runs);
  wireRunCards();
  wireRunsPagination(rendered.totalPages);
}

function renderGroupedRuns(groups, mode) {
  els.runsSurface.innerHTML = renderGroupedRunsMarkup(groups, mode, workbenchRenderContext());
  wireRunCards();
}

function workbenchRenderContext() {
  return {
    canOperate: canUseOperationalControls(),
    captureBusy: state.captureBusy,
    captureRunDirectory: state.captureRunDirectory,
    compareSelection: state.compareSelection,
    runPage: state.runPage,
    runsPerPage: state.runsPerPage
  };
}

function wireRunsPagination(totalPages) {
  const previous = document.querySelector("#runsPrevPage");
  const next = document.querySelector("#runsNextPage");
  previous?.addEventListener("click", () => {
    state.runPage = Math.max(1, state.runPage - 1);
    renderRuns();
  });
  next?.addEventListener("click", () => {
    state.runPage = Math.min(totalPages, state.runPage + 1);
    renderRuns();
  });
}

function wireRunCards() {
  els.runsSurface.querySelectorAll("[data-capture-run-id]").forEach((button) => {
    button.addEventListener("keydown", (event) => {
      event.stopPropagation();
    });
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const runId = button.dataset.captureRunId;
      const run = state.runs.find((r) => r.runId === runId);
      if (run) {
        void captureRunMedia(run);
      }
    });
  });

  els.runsSurface.querySelectorAll("[data-open-run]").forEach((card) => {
    card.addEventListener("click", () => {
      const runId = card.dataset.runId;
      const run = state.runs.find((r) => r.runId === runId);
      if (run) {
        openRunFromCurrentView(run);
      }
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const runId = card.dataset.runId;
        const run = state.runs.find((r) => r.runId === runId);
        if (run) {
          openRunFromCurrentView(run);
        }
      }
    });
  });
}

function openRunFromCurrentView(run) {
  openDetail(run);
}

function openDetail(run) {
  state.selectedRun = run;
  renderDetail(run);
  openModal("detail");
}

function renderDetail(run) {
  const detail = detailViewModel(run);
  els.detailBackdrop.querySelector(".detail-shell")?.setAttribute("data-detail-kind", "visual");
  els.detailTitle.textContent = detail.title;
  els.detailSubtitle.textContent = detail.subtitle;
  els.detailPreview.innerHTML = detail.previewHtml;
  updateDetailActions(run);
  els.detailTextTitle.textContent = detail.textRecord.title;
  els.detailPrompt.textContent = detail.promptText;
  els.promptLength.textContent = detail.promptLength;
  els.copyDetailPrompt.textContent = detail.textRecord.copyLabel;
  els.copyDetailPrompt.disabled = !detail.canCopyPrompt;
  els.detailMeta.innerHTML = detail.metaHtml;
}

function updateDetailActions(run) {
  const availability = detailActionAvailability(run);
  setOperationalAvailability(els.openHtml, availability.openHtml);
  setOperationalAvailability(els.copyDetailPath, availability.copyPath);
  setOperationalAvailability(els.openRunFolder, availability.openRunFolder);
  setOperationalAvailability(els.recaptureRun, availability.showCapture);
  setOperationalAvailability(els.deleteRun, availability.deleteRun);
  syncOperationalControls();

  const canOperate = canUseOperationalControls();
  els.openHtml.disabled = !canOperate || !availability.openHtml;
  els.copyDetailPath.disabled = !canOperate || !availability.copyPath;
  els.openRunFolder.disabled = !canOperate || !availability.openRunFolder;
  els.recaptureRun.disabled = !canOperate || !availability.capture || state.captureBusy;
  els.deleteRun.disabled = !canOperate || !availability.deleteRun;
  els.recaptureRun.title = availability.capture
    ? ""
    : "Recapture needs index.html in this run folder. Click Refresh & capture missing after adding the file.";
  if (state.captureBusy && state.captureRunDirectory === run.runDirectory) {
    els.recaptureRun.textContent = "Capturing…";
    return;
  }
  els.recaptureRun.textContent = availability.recaptureLabel;
}

function setConnectionMessage(message) {
  els.connectionMessage.textContent = message;
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
