import { els } from "./js/dom.js";
import { state } from "./js/state.js";
import { DEFAULT_LLAMA_CPP_BASE_URL, DEFAULT_LLAMA_CPP_MODEL_PATH } from "./js/constants.js";
import { clamp, escapeHtml, escapeAttribute, formatBytes, formatDate, formatDateShort, shellQuote, uniqueBy } from "./js/utils.js";
import { fetchJson, fetchStaticManifest, postJson, deleteJson } from "./js/api.js";
import { filteredRuns, groupRuns, modelsFromRuns, runSummaryText, runKind, hasCapturedVideo, needsMediaCapture, runCardState, displayRunError, runCardMediaMessage, runCardIdentity, runRecordText, canOpenVisualDetail, findRunByDirectoryOrId } from "./js/runs.js";
import { openModal, closeModal, currentModal, handleModalKeydown } from "./js/modals.js";
import { applyStoredTheme, toggleTheme, setTheme } from "./js/theme.js";
import { startHtmlPolling } from "./js/polling.js";
import { renderViewTabs, updateOnboarding, showHtmlDetectToast } from "./js/ui.js";

init();

function init() {
  initWorkspaceState();
  applyStoredTheme();
  wireEvents();
  renderViewTabs();
  updateOnboarding();
  void loadLocalData();
  setInterval(() => {
    if (!state.staticMode) {
      void loadStats();
    }
  }, 5000);
  setInterval(() => {
    if (!state.staticMode && state.lmConnected) {
      void loadModels();
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
  els.refreshConnection.addEventListener("click", () => loadConnection({ manual: true }));
  els.refreshRuns.addEventListener("click", () => refreshRuns());
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
  els.openRunFolder.addEventListener("click", () => openSelectedRunFolder(els.openRunFolder, els.detailMeta));
  els.recaptureRun.addEventListener("click", () => captureSelectedRunMedia({ force: true }));
  els.copyDetailPrompt.addEventListener("click", () => copyDetailPrompt());
  els.copyRunFolder.addEventListener("click", () => copySelectedRunFolder(els.copyRunFolder));

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
  els.runsSearch.addEventListener("input", () => {
    state.runsSearch = els.runsSearch.value;
    resetRunPage();
    renderRuns();
  });
  els.prepareRun.addEventListener("click", () => prepareRunSlot());
  els.copyPrompt.addEventListener("click", () => copyPreparedPrompt());
  els.copyPrepCommand.addEventListener("click", () => copyPrepCommand());
  els.prepRunner.addEventListener("change", () => updatePrepareMode({ preserveCommand: false }));
  els.prepBenchmark.addEventListener("change", () => updatePrepareMode());
  els.prepBaseUrl.addEventListener("input", () => updatePrepareMode({ preserveCommand: false }));
  els.prepCommand.addEventListener("input", () => {
    els.copyPrepCommand.disabled = !els.prepCommand.value.trim();
  });
  els.prepModelSelect.addEventListener("change", () => {
    updatePrepareMode({ preserveCommand: false });
  });
  if (els.checkLlamaCppBtn) {
    els.checkLlamaCppBtn.addEventListener("click", () => checkLlamaCppServer());
  }

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

function wireHelpTooltips() {
  document.querySelectorAll(".help-pill[data-tooltip]").forEach((button) => {
    button.addEventListener("mouseenter", () => showHelpTooltip(button));
    button.addEventListener("focus", () => showHelpTooltip(button));
    button.addEventListener("mouseleave", hideHelpTooltip);
    button.addEventListener("blur", hideHelpTooltip);
  });
  window.addEventListener("resize", hideHelpTooltip);
  document.addEventListener("scroll", hideHelpTooltip, true);
}

function showHelpTooltip(anchor) {
  const text = anchor.dataset.tooltip?.trim();
  if (!text) return;
  els.helpTooltip.textContent = text;
  els.helpTooltip.hidden = false;

  const anchorRect = anchor.getBoundingClientRect();
  const tooltipRect = els.helpTooltip.getBoundingClientRect();
  const gap = 8;
  const viewportGap = 12;
  const spaceRight = window.innerWidth - anchorRect.right;
  const side = spaceRight >= tooltipRect.width + gap + viewportGap ? "right" : "left";
  const rawLeft = side === "right"
    ? anchorRect.right + gap
    : anchorRect.left - tooltipRect.width - gap;
  const rawTop = anchorRect.top + (anchorRect.height - tooltipRect.height) / 2;
  const left = clamp(rawLeft, viewportGap, window.innerWidth - tooltipRect.width - viewportGap);
  const top = clamp(rawTop, viewportGap, window.innerHeight - tooltipRect.height - viewportGap);

  els.helpTooltip.style.left = left + "px";
  els.helpTooltip.style.top = top + "px";
}

function hideHelpTooltip() {
  els.helpTooltip.hidden = true;
}

/* ── Setup panel state ──────────────────────────────────────── */

function updateLmStepStates() {
  showSection(els.lmStep1, true);
  showSection(els.lmStep2, true);
  showSection(els.lmStep3, canUseOperationalControls() && state.modelSync.enabled);
}

function showSection(section, visible) {
  if (section) {
    section.hidden = !visible;
  }
}

/* ── Config presence indicators ──────────────────────────────── */

function updateConfigPresence() {
  const piExists = state.modelSync.files?.pi?.exists ?? false;
  const opencodeExists = state.modelSync.files?.opencode?.exists ?? false;
  const piPath = state.modelSync.paths?.pi || "~/.pi/agent/models.json";
  const ocPath = state.modelSync.paths?.opencode || "~/.config/opencode/opencode.json";

  els.lmConfigPiPath.textContent = piPath;
  els.lmConfigOpenCodePath.textContent = ocPath;

  if (piExists) {
    els.lmConfigPiStatus.textContent = "✓ Found";
    els.lmConfigPiStatus.dataset.state = "found";
  } else {
    els.lmConfigPiStatus.textContent = "✗ Not found";
    els.lmConfigPiStatus.dataset.state = "missing";
  }

  if (opencodeExists) {
    els.lmConfigOpenCodeStatus.textContent = "✓ Found";
    els.lmConfigOpenCodeStatus.dataset.state = "found";
  } else {
    els.lmConfigOpenCodeStatus.textContent = "✗ Not found";
    els.lmConfigOpenCodeStatus.dataset.state = "missing";
  }
}

function updateSyncButtons() {
  const canSync =
    canUseOperationalControls() &&
    state.modelSync.enabled &&
    state.discoveredModels.length > 0 &&
    !state.syncBusy;

  els.syncPiBtn.disabled = !canSync;
  els.syncOpenCodeBtn.disabled = !canSync;
}

/* ── Model inventory rendering ──────────────────────────────── */

function renderModelInventory() {
  const runModels = modelsFromRuns(state.runs);
  const currentIds = new Set(state.discoveredModels.map((m) => m.id));
  const runIds = new Set(runModels.map((m) => m.id));
  const opencodeModelIds = new Set(state.modelSync.files?.opencode?.modelIds ?? []);
  const piModelIds = new Set(state.modelSync.files?.pi?.modelIds ?? []);
  const piExists = state.modelSync.files?.pi?.exists ?? false;
  const ocExists = state.modelSync.files?.opencode?.exists ?? false;

  const models = uniqueBy(
    [...state.discoveredModels, ...runModels],
    (m) => m.id
  );

  els.availableModelCount.textContent = String(models.length);

  if (models.length === 0) {
    els.availableModelChoices.innerHTML =
      '<p class="muted-copy text-sm leading-5">' +
      (state.lmConnected
        ? "LM Studio returned no models. Load a model in LM Studio first."
        : "LM Studio did not return models and no run folders are indexed yet.") +
      "</p>";
    return;
  }

  els.availableModelChoices.innerHTML = models
    .map((model) => {
      const isCurrent = currentIds.has(model.id);
      const inPi = piModelIds.has(model.id);
      const inOc = opencodeModelIds.has(model.id);
      const source = isCurrent ? "live" : runIds.has(model.id) ? "history" : "saved";

      return (
        '<div class="lm-model-row">' +
          '<span class="lm-model-name" title="' + escapeAttribute(model.id) + '">' +
            escapeHtml(model.id) +
          "</span>" +
          '<span class="lm-source-pill" data-source="' + source + '">' + source + "</span>" +
          '<span class="lm-model-sync">' +
            renderStatusCheck("Pi", inPi, piExists) +
            renderStatusCheck("OpenCode", inOc, ocExists) +
          "</span>" +
        "</div>"
      );
    })
    .join("");
}

function renderStatusCheck(label, isPresent, configExists) {
  if (!configExists) {
    return (
      '<span class="lm-status-chip" data-state="unavailable">' +
        label + " unavailable" +
      "</span>"
    );
  }
  if (isPresent) {
    return (
      '<span class="lm-status-chip" data-state="present">' +
        label + " synced" +
      "</span>"
    );
  }
  return (
    '<span class="lm-status-chip" data-state="missing">' +
      label + " missing" +
    "</span>"
  );
}

/* ── Sync action ──────────────────────────────────────────── */

async function syncModels(targets) {
  if (state.staticMode) {
    els.syncMessage.textContent = "Sync requires the local dev server.";
    return;
  }

  const discoveredIds = state.discoveredModels
    .map((m) => m.id)
    .filter((id) => typeof id === "string" && id.length > 0);

  if (discoveredIds.length === 0) {
    els.syncMessage.textContent = "No discovered models to sync.";
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
    renderRunFilters();
    renderModelSources();
    renderRuns();
    renderPrepOptions();
    startHtmlPolling({
      onRefresh: refreshRunsForPolling,
      onDetect: showHtmlDetectToast
    });
    await Promise.allSettled([loadConnection(), loadStats(), loadModelSyncState()]);
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
    state.lmConnected = false;
    state.writesEnabled = false;
    setConnection("static", "Static", "Browsing exported runs. Sync requires the local dev server.");
    els.statsDot.dataset.state = "static";
    els.statsCompact.textContent = "Static";
    renderBenchmarks();
    renderModels();
    renderRunFilters();
    renderModelSources();
    renderPrepOptions();
    renderRuns();
    updateLmStepStates();
    updateWriteControls();
  } catch (staticError) {
    setConnection("offline", "Unavailable", (reason?.message ?? "Local API unavailable.") + " " + staticError.message);
    els.statsDot.dataset.state = "offline";
    els.statsCompact.textContent = "Unavailable";
    els.runsSurface.innerHTML = '<div class="empty">No local API or static export was found.</div>';
  }
}

async function loadConnection(options = {}) {
  if (options.manual) {
    els.refreshConnection.disabled = true;
    els.refreshConnection.textContent = "Testing…";
    setConnection("checking", "Checking", "Checking LM Studio and refreshing models…");
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
      setConnection(
        "online",
        "Online",
        "LM Studio is reachable. " + modelCount + " " + (modelCount === 1 ? "model" : "models") + " discovered."
      );
    } else {
      state.lmConnected = false;
      setConnection("offline", "Offline", connection?.error ?? "LM Studio is not reachable.");
      state.discoveredModels = [];
      renderModelSources();
      renderPrepOptions();
      await loadModelSyncState();
    }
  } catch (error) {
    state.lmConnected = false;
    setConnection("offline", "Offline", error.message);
    state.discoveredModels = [];
    renderModelSources();
    renderPrepOptions();
  } finally {
    updateLmStepStates();
    updateConfigPresence();
    updateSyncButtons();
    if (options.manual) {
      els.refreshConnection.disabled = false;
      els.refreshConnection.textContent = "Test";
    }
  }
}

async function loadModels() {
  try {
    const data = await fetchJson("/api/lmstudio/models?baseUrl=" + encodeURIComponent(els.baseUrl.value));
    const discovered = data.models ?? [];
    state.discoveredModels = discovered;
    renderModelSources();
    renderPrepOptions();
    updateLmStepStates();
    updateSyncButtons();
    return discovered.length;
  } catch {
    state.discoveredModels = [];
    renderModelSources();
    renderPrepOptions();
    updateLmStepStates();
    updateSyncButtons();
    return 0;
  }
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

async function refreshRuns() {
  if (state.staticMode) {
    await enterStaticMode(new Error("Static refresh"));
    return;
  }
  const [benchmarks, runs] = await Promise.all([
    fetchJson("/api/benchmarks"),
    fetchJson("/api/runs")
  ]);
  state.benchmarks = benchmarks.benchmarks ?? [];
  state.runs = runs.runs ?? [];
  renderBenchmarks();
  renderModels();
  renderRunFilters();
  renderModelSources();
  renderPrepOptions();
  renderRuns();
}

async function refreshRunsForPolling() {
  if (state.staticMode || state.captureBusy) {
    return;
  }

  const runs = await fetchJson("/api/runs");
  state.runs = runs.runs ?? [];
  renderModels();
  renderRunFilters();
  renderModelSources();
  renderRuns();
  updateOnboarding();
}

async function captureMissingMedia() {
  if (!canUseOperationalControls() || state.captureBusy) {
    els.runSummary.textContent = "Capture requires the local dev server.";
    return;
  }

  const queue = state.runs.filter((run) => needsMediaCapture(run));
  if (queue.length === 0) {
    els.runSummary.textContent = "No runs need media capture.";
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
    renderRunFilters();
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

function updateWriteControls() {
  const canWrite = canUseOperationalControls();
  syncOperationalControls();
  els.refreshRuns.disabled = !canWrite;
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
    renderRunFilters();
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
  els.preparedPrompt.value = "";
  els.preparedPaths.textContent = "No run slot prepared yet.";
  els.copyPrompt.disabled = true;

  if (state.benchmarks[0]) {
    els.prepBenchmark.value = state.benchmarks[0].id;
  }
  const firstModel = state.discoveredModels[0]?.id ?? "";
  els.prepModelSelect.value = firstModel;
  els.prepBaseUrl.value = DEFAULT_LLAMA_CPP_BASE_URL;
  updatePrepareMode({ preserveCommand: false });

  if (!canUseOperationalControls()) {
    els.prepareRun.disabled = true;
    els.preparedPaths.textContent = "Preparing runs requires the local dev server.";
  } else {
    els.prepareRun.disabled = false;
  }
}

function updatePrepareMode(options = {}) {
  const runner = els.prepRunner.value;
  const commandVisible = runner === "llama-cpp";
  const workflow = commandVisible ? "visual-llama-cpp" : "visual";
  els.prepBackendHelperGroup.hidden = false;
  els.prepVisualPromptGroup.hidden = false;
  els.prepModelSelectGroup.hidden = false;
  els.prepBaseUrlGroup.hidden = runner !== "llama-cpp";
  els.prepCommandGroup.hidden = !commandVisible;
  if (els.llamaCppStatusBar) {
    els.llamaCppStatusBar.hidden = !commandVisible;
  }
  els.prepLayout.dataset.kind = workflow;
  els.prepResult.dataset.panelMode = workflow;
  els.preparedPrompt.readOnly = true;
  els.prepModelSelectLabel.textContent = "Discovered model";
  els.prepBaseUrlLabel.textContent = "Base URL";

  if (!options.preserveCommand || !els.prepCommand.value.trim()) {
    els.prepCommand.value = runner === "llama-cpp"
      ? defaultLlamaCppCommand(els.prepModelSelect.value)
      : "";
  }
  els.copyPrepCommand.disabled = !commandVisible || !els.prepCommand.value.trim();
  if (!state.preparedPrompt) {
    els.preparedPrompt.value = "";
    updatePreparedCopyState();
  }

  els.prepResultTitle.textContent = commandVisible ? "Generated artifacts" : "Generated prompt";
  els.prepSubtitle.textContent = "Choose a prompt and model to generate a run folder.";
  els.prepResultHint.textContent = commandVisible
    ? "Edit the server command, prepare the slot, then copy the prompt into your visual runner."
    : "Copy this into your external tool after preparing the slot.";
  els.preparedPrompt.placeholder = "Prepare a run slot to generate the exact prompt and output path.";
  els.prepOutputLabel.textContent = "Visual prompt";
  els.copyPrompt.textContent = "Copy prompt";
  els.prepareRun.textContent = "Prepare slot";
}

function defaultLlamaCppCommand(modelId) {
  const modelPath = localPathForModel(modelId) || DEFAULT_LLAMA_CPP_MODEL_PATH;
  return [
    "llama-server \\",
    "  -m \\",
    "  " + shellQuote(modelPath) + " \\",
    "  --host 127.0.0.1 \\",
    "  --port 8080 \\",
    "  --ctx-size 8192 \\",
    "  --threads -1 \\",
    "  --n-gpu-layers 999 \\",
    "  --parallel 1"
  ].join("\n");
}

function localPathForModel(modelId) {
  return state.discoveredModels.find((model) => model.id === modelId)?.localPath ?? "";
}

async function checkLlamaCppServer() {
  if (!els.llamaCppStatusBar || !els.llamaCppStatusDot || !els.llamaCppStatusText) return;

  els.llamaCppStatusBar.hidden = false;
  els.llamaCppStatusDot.dataset.state = "checking";
  els.llamaCppStatusText.textContent = "Checking server…";
  if (els.checkLlamaCppBtn) els.checkLlamaCppBtn.disabled = true;

  const baseUrl = els.prepBaseUrl.value || DEFAULT_LLAMA_CPP_BASE_URL;

  try {
    const data = await fetchJson("/api/llama-cpp/status?baseUrl=" + encodeURIComponent(baseUrl));
    if (data.ok) {
      els.llamaCppStatusDot.dataset.state = "online";
      els.llamaCppStatusText.textContent = "Server online · " + (data.modelCount ?? 0) + " model(s)";
    } else {
      els.llamaCppStatusDot.dataset.state = "offline";
      els.llamaCppStatusText.textContent = "Server offline · " + (data.error ?? "Not reachable");
    }
  } catch (error) {
    els.llamaCppStatusDot.dataset.state = "offline";
    els.llamaCppStatusText.textContent = "Server offline · " + error.message;
  } finally {
    if (els.checkLlamaCppBtn) els.checkLlamaCppBtn.disabled = false;
  }
}

async function prepareRunSlot() {
  if (!canUseOperationalControls()) {
    els.preparedPaths.textContent = "Preparing runs requires the local dev server.";
    return;
  }
  const benchmarkId = els.prepBenchmark.value;
  const modelId = els.prepModelSelect.value.trim();
  if (!benchmarkId || !modelId) {
    els.preparedPaths.textContent = "Choose a prompt and model label.";
    return;
  }
  const runner = els.prepRunner.value;
  const launchCommand = els.prepCommand.value;
  const modelPath = runner === "llama-cpp" ? localPathForModel(modelId) : undefined;
  try {
    const data = await postJson("/api/prepare-run", {
      benchmarkId,
      modelId,
      kind: "visual",
      runner,
      baseUrl: els.prepBaseUrl.value,
      launchCommand,
      modelPath
    });
    const prepared = data.preparedRun;
    const output = prepared.prompt;
    const statusText = runner === "llama-cpp"
        ? "Run slot prepared. Command saved in metadata and command.txt."
        : "Run slot prepared. Copy the prompt into your external tool.";
    state.preparedPrompt = output;
    els.preparedPrompt.value = output;
    els.preparedPaths.textContent = statusText + " Run folder: " + prepared.paths.runDirectory +
      (prepared.command ? " · Command: " + prepared.paths.commandPath : "");
    els.copyPrompt.disabled = !output;
    updatePreparedCopyState();
    state.runs = [availablePreparedRun(prepared.run), ...state.runs.filter((run) => run.runId !== prepared.run.runId)];
    renderModels();
    renderRunFilters();
    renderModelSources();
    renderPrepOptions();
    renderRuns();
  } catch (error) {
    els.preparedPrompt.value = "";
    els.preparedPaths.textContent = "No run slot prepared yet.";
    els.copyPrompt.disabled = true;
    updatePreparedCopyState();
  }
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
  els.copyPrompt.disabled = !value;
}

async function copyPrepCommand() {
  if (!els.prepCommand.value.trim()) {
    return;
  }
  await copyTextToClipboard(els.prepCommand.value, els.copyPrepCommand, "Copy command");
  els.preparedPaths.textContent = "Command copied.";
}

async function copyDetailPrompt() {
  const text = els.detailPrompt.textContent ?? "";
  await copyTextToClipboard(text, els.copyDetailPrompt, "Copy prompt");
}

async function copySelectedRunFolder(button = els.copyRunFolder) {
  const runFolder = state.selectedRun?.runDirectory ?? "";
  await copyTextToClipboard(runFolder, button, "Copy path");
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
    renderRunFilters();
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
}

function renderRunFilters() {
  // The workbench now keeps filters to model, prompt, and search.
}

function renderModelSources() {
  renderModelInventory();
}

function renderPrepOptions() {
  els.prepBenchmark.innerHTML = state.benchmarks
    .map((b) => '<option value="' + escapeAttribute(b.id) + '">' + escapeHtml(b.title) + "</option>")
    .join("");
  els.prepModelSelect.innerHTML = [
    '<option value="">Choose discovered model</option>',
    ...state.discoveredModels.map((m) => '<option value="' + escapeAttribute(m.id) + '">' + escapeHtml(m.id) + "</option>")
  ].join("");
  if (!els.prepModelSelect.value && state.discoveredModels[0]) {
    els.prepModelSelect.value = state.discoveredModels[0].id;
  }
  updatePrepareMode({ preserveCommand: true });
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
    ? "Scan visual runs in a compact table."
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

function renderRunsTable(runs) {
  const totalPages = Math.max(1, Math.ceil(runs.length / state.runsPerPage));
  state.runPage = Math.min(Math.max(state.runPage, 1), totalPages);
  const startIndex = (state.runPage - 1) * state.runsPerPage;
  const pageRuns = runs.slice(startIndex, startIndex + state.runsPerPage);
  const showingStart = runs.length === 0 ? 0 : startIndex + 1;
  const showingEnd = Math.min(runs.length, startIndex + pageRuns.length);

  els.runsSurface.innerHTML =
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
          pageRuns.map(renderRunsTableRow).join("") +
        '</tbody>' +
      '</table>' +
    '</div>' +
    renderRunsPagination(showingStart, showingEnd, runs.length, totalPages);
  wireRunCards();
  wireRunsPagination(totalPages);
}

function renderRunsTableRow(run) {
  const isCapturing = state.captureRunDirectory && run.runDirectory === state.captureRunDirectory;
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
      '<td>' + renderRunCaptureAction(run, isCapturing, "table") + "</td>" +
      '<td class="truncate-cell">' + escapeHtml(formatDateShort(run.updatedAt ?? run.createdAt)) + "</td>" +
    "</tr>"
  );
}

function renderRunsPagination(showingStart, showingEnd, totalRuns, totalPages) {
  return (
    '<div class="runs-pagination" aria-label="Runs pagination">' +
      '<span class="muted-copy text-sm">' +
        "Showing " + String(showingStart) + "-" + String(showingEnd) + " of " + String(totalRuns) +
      "</span>" +
      '<div class="pagination-controls">' +
        '<button type="button" class="btn-sm-outline" id="runsPrevPage" ' + (state.runPage <= 1 ? "disabled" : "") + ">Previous</button>" +
        '<span class="badge-outline">Page ' + String(state.runPage) + " of " + String(totalPages) + "</span>" +
        '<button type="button" class="btn-sm-outline" id="runsNextPage" ' + (state.runPage >= totalPages ? "disabled" : "") + ">Next</button>" +
      "</div>" +
    "</div>"
  );
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

function renderGroupedRuns(groups, mode) {
  els.runsSurface.innerHTML = '<div class="grouped-runs">' + groups.map((group) =>
    '<section class="group">' +
      '<div class="group-head">' +
        "<div>" +
          '<h3 class="text-base font-semibold tracking-[-0.01em]">' + escapeHtml(group.title) + "</h3>" +
          '<p class="muted-copy mt-1 text-sm">' + escapeHtml(groupSummary(group, mode)) + "</p>" +
        "</div>" +
        '<span class="badge-outline">' + group.runs.length + "</span>" +
      "</div>" +
      '<div class="run-grid">' + group.runs.map((run) => renderRunCard(run, mode)).join("") + "</div>" +
    "</section>"
  ).join("") + "</div>";
  wireRunCards();
}

function renderRunCard(run, mode = "gallery") {
  const isCapturing = state.captureRunDirectory && run.runDirectory === state.captureRunDirectory;
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
        renderRunCaptureAction(run, isCapturing, "card") +
      "</span>" +
    "</article>"
  );
}

function renderRunCaptureAction(run, isCapturing, placement) {
  const canCapture = canUseOperationalControls() &&
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
        (isCapturing || state.captureBusy ? " disabled" : "") + ">" +
        escapeHtml(isCapturing ? "Capturing..." : label) +
      "</button>" +
    "</span>"
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
  els.detailBackdrop.querySelector(".detail-shell")?.setAttribute("data-detail-kind", "visual");
  els.detailTitle.textContent = run.benchmark?.title ?? "Run detail";
  els.detailSubtitle.textContent = (run.model?.id ?? "Unknown model") + " · " + (run.runId ?? "");
  els.detailPreview.innerHTML = renderDetailArtifact(run);
  updateDetailActions(run);
  const textRecord = runRecordText(run);
  els.detailTextTitle.textContent = textRecord.title;
  els.detailPrompt.textContent = textRecord.value || textRecord.emptyText;
  els.promptLength.textContent = textRecord.value ? textRecord.value.length.toLocaleString() + " chars" : "missing";
  els.copyDetailPrompt.textContent = textRecord.copyLabel;
  els.copyDetailPrompt.disabled = !textRecord.value;
  els.detailRunFolderPath.textContent = run.runDirectory ?? "Run folder unavailable";
  els.copyRunFolder.disabled = !run.runDirectory;
  const stateLabel = runCardState(run);
  els.detailMeta.innerHTML =
    '<span class="meta-label">State</span><strong>' + escapeHtml(stateLabel.label) + "</strong>" +
    '<span class="meta-label">Model</span><strong>' + escapeHtml(run.model?.id ?? "-") + "</strong>" +
    '<span class="meta-label">Updated</span><strong>' + escapeHtml(formatDate(run.updatedAt)) + "</strong>";
}

function updateDetailActions(run) {
  const isVisualRun = runKind(run) === "visual";
  setOperationalAvailability(els.openHtml, Boolean(isVisualRun && run.runDirectory && run.assets?.html));
  setOperationalAvailability(els.openRunFolder, Boolean(run.runDirectory));

  const canCapture = Boolean(isVisualRun && run.runDirectory && run.assets?.html);
  setOperationalAvailability(els.recaptureRun, canCapture);
  setOperationalAvailability(els.deleteRun, Boolean(run.runDirectory));
  syncOperationalControls();

  const canOperate = canUseOperationalControls();
  els.openHtml.disabled = !canOperate || !run.runDirectory || !run.assets?.html;
  els.openRunFolder.disabled = !canOperate || !run.runDirectory;
  els.recaptureRun.disabled = !canOperate || !canCapture || state.captureBusy;
  els.deleteRun.disabled = !canOperate || !run.runDirectory;
  if (state.captureBusy && state.captureRunDirectory === run.runDirectory) {
    els.recaptureRun.textContent = "Capturing…";
    return;
  }
  els.recaptureRun.textContent = run.assets?.preview || hasCapturedVideo(run)
    ? "Recapture media"
    : "Capture preview";
}

function renderDetailArtifact(run) {
  const videoHref = assetHref(run, run.assets?.video);
  const mp4Href = assetHref(run, run.assets?.videoMp4);
  if (videoHref || mp4Href) {
    const firstVideoHref = mp4Href || videoHref;
    const previewHref = assetHref(run, run.assets?.preview);
    return '<video class="artifact-video" src="' + escapeAttribute(firstVideoHref) + '" ' +
      (previewHref ? 'poster="' + escapeAttribute(previewHref) + '" ' : '') +
      'autoplay muted loop playsinline controls>' +
      (mp4Href ? '<source src="' + escapeAttribute(mp4Href) + '" type="video/mp4" />' : '') +
      (videoHref ? '<source src="' + escapeAttribute(videoHref) + '" type="video/webm" />' : '') +
      '</video>';
  }

  if (run.assets?.html) {
    return '<span class="artifact-empty">' +
      '<strong>Video not captured yet</strong>' +
      '<span>Use Capture preview in server mode to generate preview.png and preview video from the saved index.html source.</span>' +
      "</span>";
  }

  return '<span class="artifact-empty">' +
    '<strong>' + escapeHtml(run.status === "prepared" ? "Run slot prepared" : "Artifact unavailable") + "</strong>" +
    '<span>' + escapeHtml(run.status === "prepared" ? "Save index.html into the run folder, then run Capture preview." : displayRunError(run) ?? "No captured video is available for this run.") + "</span>" +
    "</span>";
}

function setConnection(stateName, label, message) {
  els.connectionMessage.textContent = message;
}

function groupSummary(group, mode) {
  const count = group.subtitles.length;
  const item = mode === "model" ? "prompt" : "model";
  return String(count) + " " + item + (count === 1 ? "" : "s");
}

function assetPath(run, asset) {
  if (!asset || !run.runDirectory) return "";
  return String(run.runDirectory).replace(/\/+$/u, "") + "/" + asset;
}

function assetHref(run, asset) {
  const path = assetPath(run, asset);
  if (!path) return null;
  const version = assetVersion(run, asset);
  if (/^[a-z][a-z0-9+.-]*:/iu.test(path)) return path;
  if (state.staticMode || path.startsWith("export/")) {
    return appendAssetVersion(path.replace(/^\/+/u, ""), version);
  }
  return "/api/run-asset?runDirectory=" + encodeURIComponent(run.runDirectory) +
    "&asset=" + encodeURIComponent(asset) +
    (version ? "&v=" + encodeURIComponent(version) : "");
}

function assetVersion(run, asset) {
  if (!asset) return "";
  if (asset === run.assets?.preview) {
    return run.capture?.preview?.capturedAt ?? run.updatedAt ?? "";
  }
  if (asset === run.assets?.video || asset === run.assets?.videoMp4) {
    return run.capture?.video?.capturedAt ?? run.updatedAt ?? "";
  }
  return run.updatedAt ?? "";
}

function appendAssetVersion(path, version) {
  if (!version) return path;
  return path + (path.includes("?") ? "&" : "?") + "v=" + encodeURIComponent(version);
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
