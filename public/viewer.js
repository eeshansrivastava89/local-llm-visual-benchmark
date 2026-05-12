import { els } from "./js/dom.js";
import { state } from "./js/state.js";
import { clamp, escapeHtml, escapeAttribute, formatBytes, formatDate, formatDateShort, uniqueBy } from "./js/utils.js";
import { fetchJson, fetchStaticManifest, postJson, deleteJson } from "./js/api.js";
import { assetHref } from "./js/assets.js";
import { compareRunKey, toggleCompareSelection } from "./js/compare.js";
import { renderCompareRuns as renderCompareRunsMarkup } from "./js/compare-ui.js";
import { filteredRuns, groupRuns, modelsFromRuns, runSummaryText, runKind, hasCapturedVideo, needsMediaCapture, runCardState, displayRunError, runCardMediaMessage, runCardIdentity, runRecordText, findRunByDirectoryOrId } from "./js/runs.js";
import { openModal, closeModal, currentModal, handleModalKeydown } from "./js/modals.js";
import { applyStoredTheme, toggleTheme, setTheme } from "./js/theme.js";
import { startHtmlPolling } from "./js/polling.js";
import { renderViewTabs, updateOnboarding, showHtmlDetectToast } from "./js/ui.js";

const SOURCE_STATUS_COPY = {
  omlx: {
    label: "oMLX",
    offlineHint: "Start the oMLX server, then refresh.",
    emptyHint: "oMLX is reachable but returned no models."
  },
  lmstudio: {
    label: "LM Studio",
    offlineHint: "Start LM Studio's local server, then refresh.",
    emptyHint: "LM Studio is reachable but returned no models."
  }
};

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

function wireHelpTooltips() {
  document.querySelectorAll("[data-tooltip]").forEach((button) => {
    if (button.classList.contains("source-status-pill")) {
      button.addEventListener("mousemove", () => showHelpTooltip(button));
      button.addEventListener("mouseleave", hideHelpTooltip);
      return;
    }
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
  if (anchor.classList.contains("source-status-pill")) {
    const canPlaceAbove = anchorRect.top - tooltipRect.height - gap >= viewportGap;
    const rawLeft = anchorRect.left;
    const rawTop = canPlaceAbove
      ? anchorRect.top - tooltipRect.height - gap
      : anchorRect.bottom + gap;
    const left = clamp(rawLeft, viewportGap, window.innerWidth - tooltipRect.width - viewportGap);
    const top = clamp(rawTop, viewportGap, window.innerHeight - tooltipRect.height - viewportGap);
    els.helpTooltip.style.left = left + "px";
    els.helpTooltip.style.top = top + "px";
    return;
  }
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
    state.lmStudioModels.length > 0 &&
    !state.syncBusy;

  els.syncPiBtn.disabled = !canSync;
  els.syncOpenCodeBtn.disabled = !canSync;
}

/* ── Model inventory rendering ──────────────────────────────── */

function renderModelInventory() {
  const runModels = modelsFromRuns(state.runs);
  const currentKeys = new Set(state.discoveredModels.map(modelKey));
  const runIds = new Set(runModels.map((m) => m.id));
  const opencodeModelIds = new Set(state.modelSync.files?.opencode?.modelIds ?? []);
  const piModelIds = new Set(state.modelSync.files?.pi?.modelIds ?? []);
  const piExists = state.modelSync.files?.pi?.exists ?? false;
  const ocExists = state.modelSync.files?.opencode?.exists ?? false;

  const models = uniqueBy(
    [...state.discoveredModels, ...runModels],
    (m) => modelKey(m)
  );

  els.availableModelCount.textContent = String(models.length);

  if (models.length === 0) {
    els.availableModelChoices.innerHTML =
      '<p class="muted-copy text-sm leading-5">' +
      (state.omlxConnected || state.lmConnected
        ? "No live models were returned. Load a model in oMLX or LM Studio first."
        : "No local model source returned models and no run folders are indexed yet.") +
      "</p>";
    return;
  }

  els.availableModelChoices.innerHTML = models
    .map((model) => {
      const isCurrent = currentKeys.has(modelKey(model));
      const inPi = piModelIds.has(model.id);
      const inOc = opencodeModelIds.has(model.id);
      const source = isCurrent
        ? modelSourceLabel(model.source)
        : runIds.has(model.id)
          ? "history"
          : "saved";

      return (
        '<div class="lm-model-row">' +
          '<span class="lm-model-name" title="' + escapeAttribute(model.id) + '">' +
            escapeHtml(model.id) +
          "</span>" +
          '<span class="lm-source-pill" data-source="' + escapeAttribute(source.toLowerCase().replace(/\\s+/gu, "-")) + '">' + source + "</span>" +
          '<span class="lm-model-sync">' +
            (model.source === "lmstudio"
              ? renderStatusCheck("Pi", inPi, piExists) + renderStatusCheck("OpenCode", inOc, ocExists)
              : '<span class="lm-status-chip" data-state="unavailable">Config sync not needed</span>') +
          "</span>" +
        "</div>"
      );
    })
    .join("");
}

function modelKey(model) {
  return (model.source || "history") + ":" + model.id;
}

function modelSourceLabel(source) {
  if (source === "omlx") return "oMLX";
  if (source === "lmstudio") return "LM Studio";
  return "history";
}

function initSourceStatuses() {
  setSourceStatus("omlx", "checking", 0, "Checking oMLX model server.");
  setSourceStatus("lmstudio", "checking", 0, "Checking LM Studio model server.");
}

function setSourceStatus(source, status, count, message) {
  if (!state.sourceHealth[source]) {
    state.sourceHealth[source] = {};
  }
  state.sourceHealth[source] = {
    status,
    count,
    message
  };
  updateSourceStatusPill(source);
  updatePrepareModelWarning();
}

function updateSourceStatusPill(source) {
  const elements = sourceStatusElements(source);
  if (!elements.pill || !elements.dot || !elements.text) return;

  const health = state.sourceHealth[source] ?? { status: "checking", count: 0 };
  const label = SOURCE_STATUS_COPY[source]?.label ?? modelSourceLabel(source);
  const count = Number.isFinite(health.count) ? health.count : 0;
  const status = health.status ?? "checking";
  const text = status === "online"
    ? label + " " + String(count)
    : status === "offline"
      ? label + " off"
      : status === "static"
        ? label + " static"
        : label + " checking";
  const tooltip = health.message || sourceStatusMessage(source, status, count);

  elements.pill.dataset.status = status;
  elements.pill.dataset.tooltip = tooltip;
  elements.pill.setAttribute("aria-label", label + ": " + tooltip);
  elements.dot.dataset.state = status === "online"
    ? "online"
    : status === "offline"
      ? "offline"
      : status === "static"
        ? "static"
        : "checking";
  elements.text.textContent = text;
}

function sourceStatusElements(source) {
  if (source === "omlx") {
    return {
      pill: els.omlxStatusPill,
      dot: els.omlxStatusDot,
      text: els.omlxStatusText
    };
  }
  return {
    pill: els.lmStudioStatusPill,
    dot: els.lmStudioStatusDot,
    text: els.lmStudioStatusText
  };
}

function sourceStatusMessage(source, status, count) {
  const copy = SOURCE_STATUS_COPY[source] ?? { label: modelSourceLabel(source), offlineHint: "Start the server, then refresh.", emptyHint: "The server returned no models." };
  if (status === "online") {
    return count > 0
      ? copy.label + " is reachable with " + String(count) + " " + (count === 1 ? "model" : "models") + "."
      : copy.emptyHint;
  }
  if (status === "offline") {
    return copy.label + " is not reachable. " + copy.offlineHint;
  }
  if (status === "static") {
    return copy.label + " status requires the local dev server.";
  }
  return "Checking " + copy.label + " model server.";
}

function selectedSourceHealth() {
  return state.sourceHealth[state.selectedModelSource] ?? {
    status: "checking",
    count: 0,
    message: sourceStatusMessage(state.selectedModelSource, "checking", 0)
  };
}

function prepareModelPlaceholder(source) {
  const health = state.sourceHealth[source] ?? { status: "checking", count: 0 };
  const label = modelSourceLabel(source);
  if (health.status === "offline") return label + " offline";
  if (health.status === "checking") return "Checking " + label + "...";
  if (health.status === "static") return label + " unavailable";
  if ((modelsForSource(source)).length === 0) return "No " + label + " models";
  return "Choose " + label + " model";
}

function updatePrepareModelWarning() {
  if (!els.prepModelWarning || !els.prepModelSelect || !els.prepareRun) return;

  const source = state.selectedModelSource;
  const sourceModels = modelsForSource(source);
  const health = selectedSourceHealth();
  const copy = SOURCE_STATUS_COPY[source] ?? { label: modelSourceLabel(source), offlineHint: "Start the server, then refresh." };
  const isOffline = health.status === "offline";
  const message = isOffline
    ? copy.label + " is not reachable. " + copy.offlineHint
    : "";

  els.prepModelWarning.hidden = !message;
  els.prepModelWarning.textContent = message;
  els.prepModelWarning.dataset.state = health.status ?? "checking";
  els.prepModelSelect.title = health.message || sourceStatusMessage(source, health.status, sourceModels.length);
  els.prepareRun.disabled = !canUseOperationalControls() || sourceModels.length === 0;
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
  els.preparedPrompt.placeholder = "Prepare a run slot to generate the exact prompt and output path.";
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
    const statusText = "Run slot prepared for " + modelSourceLabel(modelSource) + " via " + harnessLabel(runner) + ". Copy the prompt into your harness.";
    state.preparedPrompt = output;
    els.preparedPrompt.value = output;
    els.preparedPaths.textContent = statusText;
    els.copyPrompt.disabled = !output;
    updatePreparedCopyState();
    state.runs = [availablePreparedRun(prepared.run), ...state.runs.filter((run) => run.runId !== prepared.run.runId)];
    renderModels();
    renderModelSources();
    renderPrepOptions();
    renderRuns();
  } catch (error) {
    els.preparedPrompt.value = "";
    els.preparedPaths.textContent = "Prepare failed: " + error.message;
    els.copyPrompt.disabled = true;
    updatePreparedCopyState();
  }
}

function harnessLabel(runner) {
  if (runner === "opencode") return "OpenCode";
  if (runner === "pi") return "Pi";
  if (runner === "hermes") return "Hermes";
  return "manual chat";
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
    : state.mode === "compare"
      ? "Compare runs"
      : state.mode === "benchmark"
        ? "Prompt comparison"
        : "Prompt comparison";
  els.viewSubtitle.textContent = state.mode === "model"
    ? "Group attempts by model and prompt."
    : state.mode === "table"
    ? "Scan visual runs in a compact table."
    : state.mode === "compare"
      ? "Select 2-4 visual runs for side-by-side inspection."
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

  if (state.mode === "compare") {
    renderCompareRuns(runs);
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

function renderCompareRuns(runs) {
  els.runsSurface.innerHTML = renderCompareRunsMarkup(runs, state.compareSelection);
  wireCompareSelection(runs);
}

function wireCompareSelection(runs) {
  document.querySelectorAll("[data-compare-select]").forEach((input) => {
    input.addEventListener("change", () => {
      const run = runs.find((candidate) => compareRunKey(candidate) === input.dataset.compareSelect);
      state.compareSelection = toggleCompareSelection(state.compareSelection, run);
      renderRuns();
    });
  });
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

  const previewHref = assetHref(run, run.assets?.preview);
  if (previewHref) {
    return '<span class="artifact-image"><img src="' + escapeAttribute(previewHref) + '" alt="" /></span>';
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

function setConnectionMessage(message) {
  els.connectionMessage.textContent = message;
}

function groupSummary(group, mode) {
  const count = group.subtitles.length;
  const item = mode === "model" ? "prompt" : "model";
  return String(count) + " " + item + (count === 1 ? "" : "s");
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
