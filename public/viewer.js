const state = {
  staticMode: false,
  benchmarks: [],
  discoveredModels: [],
  modelSync: {
    enabled: false,
    paths: {
      opencode: "",
      pi: ""
    },
    files: {
      opencode: {
        exists: false,
        modelIds: []
      },
      pi: {
        exists: false,
        modelIds: []
      }
    }
  },
  lmConnected: false,
  writesEnabled: true,
  syncBusy: false,
  captureBusy: false,
  runs: [],
  stats: null,
  selectedModel: "all",
  selectedBenchmark: "all",
  mode: "gallery",
  preparedPrompt: "",
  selectedRun: null,
  captureRunDirectory: "",
  modalFocusReturn: {}
};

const els = {
  // Header / system
  statsPill: document.querySelector("#statsPill"),
  statsDot: document.querySelector("#statsDot"),
  statsCompact: document.querySelector("#statsCompact"),
  operationalControls: document.querySelectorAll(".operational-control"),
  // Toggles
  themeToggle: document.querySelector("#themeToggle"),
  themeIcon: document.querySelector("#themeIcon"),
  themeLabel: document.querySelector("#themeLabel"),
  setupToggle: document.querySelector("#setupToggle"),
  runToggle: document.querySelector("#runToggle"),
  // Modals
  detailBackdrop: document.querySelector("#detailBackdrop"),
  closeDetail: document.querySelector("#closeDetail"),
  prepBackdrop: document.querySelector("#prepBackdrop"),
  closePrep: document.querySelector("#closePrep"),
  setupBackdrop: document.querySelector("#setupBackdrop"),
  closeSetup: document.querySelector("#closeSetup"),
  deleteConfirmBackdrop: document.querySelector("#deleteConfirmBackdrop"),
  closeDeleteConfirm: document.querySelector("#closeDeleteConfirm"),
  cancelDeleteRun: document.querySelector("#cancelDeleteRun"),
  confirmDeleteRun: document.querySelector("#confirmDeleteRun"),
  deleteRunPath: document.querySelector("#deleteRunPath"),
  // LM Studio step sections
  lmStep1: document.querySelector("#lmStep1"),
  lmStep2: document.querySelector("#lmStep2"),
  lmStep3: document.querySelector("#lmStep3"),
  // LM Studio step 1: Connect
  baseUrl: document.querySelector("#baseUrl"),
  refreshConnection: document.querySelector("#refreshConnection"),
  connectionMessage: document.querySelector("#connectionMessage"),
  // LM Studio step 2: Discover
  availableModelChoices: document.querySelector("#availableModelChoices"),
  availableModelCount: document.querySelector("#availableModelCount"),
  lmModelHeader: document.querySelector("#lmModelHeader"),
  // LM Studio step 3: Sync
  lmConfigPi: document.querySelector("#lmConfigPi"),
  lmConfigPiPath: document.querySelector("#lmConfigPiPath"),
  lmConfigPiStatus: document.querySelector("#lmConfigPiStatus"),
  lmConfigOpenCode: document.querySelector("#lmConfigOpenCode"),
  lmConfigOpenCodePath: document.querySelector("#lmConfigOpenCodePath"),
  lmConfigOpenCodeStatus: document.querySelector("#lmConfigOpenCodeStatus"),
  syncPiBtn: document.querySelector("#syncPiBtn"),
  syncOpenCodeBtn: document.querySelector("#syncOpenCodeBtn"),
  syncMessage: document.querySelector("#syncMessage"),
  // Filters
  modelFilter: document.querySelector("#modelFilter"),
  benchmarkFilter: document.querySelector("#benchmarkFilter"),
  // Prepare run
  prepBenchmark: document.querySelector("#prepBenchmark"),
  prepModelSelect: document.querySelector("#prepModelSelect"),
  prepareRun: document.querySelector("#prepareRun"),
  prepMessage: document.querySelector("#prepMessage"),
  prepResult: document.querySelector("#prepResult"),
  preparedPrompt: document.querySelector("#preparedPrompt"),
  preparedPaths: document.querySelector("#preparedPaths"),
  copyPrompt: document.querySelector("#copyPrompt"),
  // Gallery
  viewTitle: document.querySelector("#viewTitle"),
  viewSubtitle: document.querySelector("#viewSubtitle"),
  runSummary: document.querySelector("#runSummary"),
  runCount: document.querySelector("#runCount"),
  runsSurface: document.querySelector("#runsSurface"),
  refreshRuns: document.querySelector("#refreshRuns"),
  captureMedia: document.querySelector("#captureMedia"),
  // Detail
  detailTitle: document.querySelector("#detailTitle"),
  detailSubtitle: document.querySelector("#detailSubtitle"),
  detailPreview: document.querySelector("#detailPreview"),
  openHtml: document.querySelector("#openHtml"),
  recaptureRun: document.querySelector("#recaptureRun"),
  deleteRun: document.querySelector("#deleteRun"),
  detailPrompt: document.querySelector("#detailPrompt"),
  promptLength: document.querySelector("#promptLength"),
  detailMeta: document.querySelector("#detailMeta"),
  detailPaths: document.querySelector("#detailPaths")
};

init();

function init() {
  applyStoredTheme();
  wireEvents();
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

function wireEvents() {
  els.refreshConnection.addEventListener("click", () => loadConnection({ manual: true }));
  els.refreshRuns.addEventListener("click", () => refreshRuns());
  els.captureMedia.addEventListener("click", () => captureMissingMedia());
  els.syncPiBtn.addEventListener("click", () => syncModels(["pi"]));
  els.syncOpenCodeBtn.addEventListener("click", () => syncModels(["opencode"]));

  els.themeToggle.addEventListener("click", () => toggleTheme());
  els.setupToggle.addEventListener("click", () => openModal("setup"));
  els.runToggle.addEventListener("click", () => openModal("prep"));

  els.closeDetail.addEventListener("click", () => closeModal("detail"));
  els.closePrep.addEventListener("click", () => closeModal("prep"));
  els.closeSetup.addEventListener("click", () => closeModal("setup"));
  els.closeDeleteConfirm.addEventListener("click", () => closeModal("deleteConfirm"));
  els.cancelDeleteRun.addEventListener("click", () => closeModal("deleteConfirm"));
  els.confirmDeleteRun.addEventListener("click", () => confirmDeleteSelectedRun());
  document.addEventListener("keydown", handleModalKeydown);

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
  els.recaptureRun.addEventListener("click", () => captureSelectedRunMedia({ force: true }));

  els.modelFilter.addEventListener("change", () => {
    state.selectedModel = els.modelFilter.value;
    renderRuns();
  });
  els.benchmarkFilter.addEventListener("change", () => {
    state.selectedBenchmark = els.benchmarkFilter.value;
    renderRuns();
  });

  els.prepareRun.addEventListener("click", () => prepareRunSlot());
  els.copyPrompt.addEventListener("click", () => copyPreparedPrompt());

  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      renderModeButtons();
      renderRuns();
    });
  });
}

function applyStoredTheme() {
  const theme = localStorage.getItem("theme") === "dark" ? "dark" : "light";
  setTheme(theme);
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("theme", next);
  setTheme(next);
}

function setTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.toggleAttribute("data-theme", isDark);
  if (isDark) {
    document.documentElement.dataset.theme = "dark";
  }
  els.themeToggle.setAttribute("aria-label", isDark ? "Use light theme" : "Use dark theme");
  els.themeToggle.title = isDark ? "Use light theme" : "Use dark theme";
  els.themeIcon.textContent = isDark ? "☼" : "☾";
  els.themeLabel.textContent = isDark ? "Light" : "Dark";
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
          '<span class="lm-model-name" title="' + escapeHtml(model.id) + '">' +
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

/* ── Modal open/close ────────────────────────────────────── */

function openModal(name) {
  const map = {
    detail: els.detailBackdrop,
    prep: els.prepBackdrop,
    setup: els.setupBackdrop,
    deleteConfirm: els.deleteConfirmBackdrop
  };
  const el = map[name];
  if (el) {
    state.modalFocusReturn[name] = document.activeElement;
    el.setAttribute("open", "");
    syncBodyOverflow();
    queueMicrotask(() => focusFirstModalControl(el));
  }
  if (name === "prep" && !canUseOperationalControls()) {
    els.prepareRun.disabled = true;
    els.prepMessage.textContent = "Preparing runs requires the local dev server.";
  } else if (name === "prep") {
    els.prepareRun.disabled = false;
    els.prepMessage.textContent = "The app will create the folder, metadata.json, and prompt.md.";
  }
  if (name === "setup") {
    updateLmStepStates();
    updateConfigPresence();
    updateSyncButtons();
  }
}

function closeModal(name) {
  const map = {
    detail: els.detailBackdrop,
    prep: els.prepBackdrop,
    setup: els.setupBackdrop,
    deleteConfirm: els.deleteConfirmBackdrop
  };
  const el = map[name];
  if (el) {
    el.removeAttribute("open");
    syncBodyOverflow();
    restoreModalFocus(name);
  }
  if (name === "detail") {
    els.detailPreview.replaceChildren();
    state.selectedRun = null;
  }
  if (name === "prep") {
    resetPrepareRunModal();
  }
}

function handleModalKeydown(event) {
  const modal = currentModal();
  if (!modal) {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closeModal(modal.name);
    return;
  }

  if (event.key === "Tab") {
    trapModalFocus(event, modal.element);
  }
}

function currentModal() {
  const entries = [
    ["deleteConfirm", els.deleteConfirmBackdrop],
    ["detail", els.detailBackdrop],
    ["prep", els.prepBackdrop],
    ["setup", els.setupBackdrop]
  ];
  const entry = entries.find(([, element]) => element?.hasAttribute("open"));
  return entry ? { name: entry[0], element: entry[1] } : null;
}

function syncBodyOverflow() {
  document.body.style.overflow = currentModal() ? "hidden" : "";
}

function focusFirstModalControl(modal) {
  const focusable = modalFocusableElements(modal);
  (focusable[0] ?? modal).focus();
}

function restoreModalFocus(name) {
  const target = state.modalFocusReturn[name];
  delete state.modalFocusReturn[name];
  if (target && typeof target.focus === "function" && !currentModal()) {
    target.focus();
  }
}

function trapModalFocus(event, modal) {
  const focusable = modalFocusableElements(modal);
  if (focusable.length === 0) {
    event.preventDefault();
    modal.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function modalFocusableElements(modal) {
  return Array.from(
    modal.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => !element.hidden && element.offsetParent !== null);
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
  renderModelSources();
  renderPrepOptions();
  renderRuns();
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
  els.captureMedia.disabled = !canWrite || state.captureBusy;
  els.refreshRuns.disabled = !canWrite;
  els.captureMedia.textContent = state.captureBusy ? "Capturing…" : "Capture media";
  if (state.selectedRun) {
    updateDetailActions(state.selectedRun);
  }
}

function canUseOperationalControls() {
  return !state.staticMode && state.writesEnabled;
}

function syncOperationalControls() {
  const canShow = canUseOperationalControls();
  els.operationalControls.forEach((control) => {
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
  if (!run?.runDirectory || !canUseOperationalControls() || state.captureBusy) {
    return;
  }

  state.captureBusy = true;
  state.captureRunDirectory = run.runDirectory;
  updateWriteControls();
  els.recaptureRun.textContent = "Capturing…";

  try {
    const data = await postJson("/api/capture-media", {
      runDirectory: run.runDirectory,
      force: Boolean(options.force)
    });
    state.runs = data.runs ?? state.runs;
    const nextRun = findRunByDirectoryOrId(run) ?? run;
    state.selectedRun = nextRun;
    renderModels();
    renderModelSources();
    renderPrepOptions();
    renderRuns();
    renderDetail(nextRun);
  } catch (error) {
    els.detailMeta.innerHTML +=
      '<span class="meta-label">Capture</span><strong>' + escapeHtml(error.message) + "</strong>";
  } finally {
    state.captureBusy = false;
    state.captureRunDirectory = "";
    renderRuns();
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
  els.prepModelSelect.value = state.discoveredModels[0]?.id ?? "";

  if (!canUseOperationalControls()) {
    els.prepareRun.disabled = true;
    els.prepMessage.textContent = "Preparing runs requires the local dev server.";
  } else {
    els.prepareRun.disabled = false;
    els.prepMessage.textContent = "The app will create the folder, metadata.json, and prompt.md.";
  }
}

async function prepareRunSlot() {
  if (!canUseOperationalControls()) {
    els.prepMessage.textContent = "Preparing runs requires the local dev server.";
    return;
  }
  const benchmarkId = els.prepBenchmark.value;
  const modelId = els.prepModelSelect.value.trim();
  if (!benchmarkId || !modelId) {
    els.prepMessage.textContent = "Choose a prompt and discovered model.";
    return;
  }
  try {
    const data = await postJson("/api/prepare-run", {
      benchmarkId,
      modelId
    });
    const prepared = data.preparedRun;
    state.preparedPrompt = prepared.prompt;
    els.preparedPrompt.value = prepared.prompt;
    els.preparedPaths.textContent = "Run folder: " + prepared.paths.runDirectory;
    els.prepMessage.textContent = "Run slot prepared. Copy the prompt into your external tool.";
    els.copyPrompt.disabled = false;
    state.runs = [availablePreparedRun(prepared.run), ...state.runs.filter((run) => run.runId !== prepared.run.runId)];
    renderModels();
    renderModelSources();
    renderPrepOptions();
    renderRuns();
  } catch (error) {
    els.prepMessage.textContent = error.message;
    els.preparedPrompt.value = "";
    els.preparedPaths.textContent = "No run slot prepared yet.";
    els.copyPrompt.disabled = true;
  }
}

async function copyPreparedPrompt() {
  if (!els.preparedPrompt.value) {
    return;
  }
  await navigator.clipboard.writeText(els.preparedPrompt.value);
  els.prepMessage.textContent = "Prompt copied.";
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
  els.deleteRun.disabled = true;
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
    els.deleteRun.disabled = false;
  }
}

/* ── Rendering ────────────────────────────────────────────── */

function renderBenchmarks() {
  els.benchmarkFilter.innerHTML = [
    '<option value="all">All prompts</option>',
    ...state.benchmarks.map((b) =>
      '<option value="' + escapeAttribute(b.id) + '">' + escapeHtml(b.title) + "</option>"
    )
  ].join("");
}

function renderModels() {
  const runModels = modelsFromRuns(state.runs);
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
}

function renderModeButtons() {
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mode === state.mode));
  });
}

function renderRuns() {
  const runs = filteredRuns();
  els.runCount.textContent = String(runs.length);
  els.runSummary.textContent = runSummaryText(runs);
  els.viewTitle.textContent = state.mode === "model"
    ? "Model attempts"
    : state.mode === "benchmark"
      ? "Prompt comparison"
      : "Run gallery";
  els.viewSubtitle.textContent = state.mode === "model"
    ? "Group attempts by model and prompt."
    : state.mode === "benchmark"
      ? "Compare one prompt across models."
      : "Browse captured previews and videos.";

  if (runs.length === 0) {
    els.runsSurface.innerHTML = !canUseOperationalControls()
      ? '<div class="empty">No runs match the current filters.</div>'
      : '<div class="empty">No runs match the current filters. <button type="button" class="btn-sm-ghost" id="emptyPrepRun">Prepare a run</button> or refresh after your external tool writes files.</div>';
    const emptyPrep = document.querySelector("#emptyPrepRun");
    if (emptyPrep) {
      emptyPrep.addEventListener("click", () => openModal("prep"));
    }
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

  els.runsSurface.innerHTML = '<div class="run-grid">' + runs.map((run) => renderRunCard(run, "gallery")).join("") + "</div>";
  wireRunCards();
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
    '<button class="run-card" type="button" data-run-id="' + escapeAttribute(run.runId) + '" aria-label="' +
    escapeAttribute(run.benchmark?.title ?? "Run") + " " + escapeAttribute(run.model?.id ?? "") + '">' +
      renderPreview(run, { capturing: isCapturing }) +
      '<span class="run-card-body">' +
        '<span class="grid min-w-0 gap-1">' +
          '<strong class="truncate-line text-sm font-semibold">' + escapeHtml(identity.primary) + "</strong>" +
          (identity.secondary ? '<span class="muted-copy truncate-line text-sm">' + escapeHtml(identity.secondary) + "</span>" : "") +
        "</span>" +
        '<span class="flex items-center justify-between gap-3">' +
          '<span class="inline-flex items-center gap-2 rounded-full border px-2 py-1 text-[0.72rem] font-medium text-muted-foreground">' +
            '<span class="status-dot" data-status="' + escapeAttribute(stateLabel.status) + '"></span>' +
            escapeHtml(stateLabel.label) +
          "</span>" +
          '<span class="muted-copy truncate-line text-xs">' + escapeHtml(formatDateShort(run.updatedAt ?? run.createdAt)) + "</span>" +
        "</span>" +
        renderAssetBadges(run) +
        '<span class="muted-copy text-sm">' + escapeHtml(runCardMediaMessage(run, isCapturing)) + "</span>" +
      "</span>" +
    "</button>"
  );
}

function renderAssetBadges(run) {
  const badges = [
    { label: "SRC", ready: Boolean(run.assets?.html) },
    { label: "PNG", ready: Boolean(run.assets?.preview) },
    { label: "VID", ready: Boolean(run.assets?.video || run.assets?.videoMp4) }
  ];

  return '<span class="flex flex-wrap items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em]">' +
    badges.map((badge) =>
      '<span class="rounded border px-1.5 py-0.5 ' +
        (badge.ready ? 'border-[oklch(0.78_0.08_158)] bg-[oklch(0.95_0.035_158)] text-[oklch(0.34_0.08_158)]' : 'border-border bg-muted text-muted-foreground') +
      '">' + escapeHtml(badge.label + " " + (badge.ready ? "✓" : "—")) + "</span>"
    ).join("") +
  "</span>";
}

function renderCaptureOverlay(capturing) {
  if (!capturing) {
    return "";
  }

  return '<span class="capture-overlay" aria-live="polite"><span class="capture-spinner" aria-hidden="true"></span><strong>Capturing</strong></span>';
}

function runCardMediaMessage(run, isCapturing) {
  if (isCapturing) return "Capturing preview media";
  if (hasCapturedVideo(run)) return "Video ready";
  if (run.assets?.html) return "Needs media capture";
  return "Waiting for index.html source";
}

function runCardIdentity(run, mode) {
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
  els.runsSurface.querySelectorAll("[data-run-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const runId = button.dataset.runId;
      const run = state.runs.find((r) => r.runId === runId);
      if (run) {
        openDetail(run);
      }
    });
  });
}

function openDetail(run) {
  state.selectedRun = run;
  renderDetail(run);
  openModal("detail");
}

function renderDetail(run) {
  els.detailTitle.textContent = run.benchmark?.title ?? "Run detail";
  els.detailSubtitle.textContent = (run.model?.id ?? "Unknown model") + " · " + (run.runId ?? "");
  els.detailPreview.innerHTML = renderDetailArtifact(run);
  updateDetailActions(run);
  const prompt = run.promptText ?? run.benchmark?.prompt ?? "Prompt unavailable in run folder.";
  els.detailPrompt.textContent = prompt;
  els.promptLength.textContent = prompt.length.toLocaleString() + " chars";
  const stateLabel = runCardState(run);
  els.detailMeta.innerHTML =
    '<span class="meta-label">State</span><strong>' + escapeHtml(stateLabel.label) + "</strong>" +
    '<span class="meta-label">Model</span><strong>' + escapeHtml(run.model?.id ?? "-") + "</strong>" +
    '<span class="meta-label">Prompt</span><strong>' + escapeHtml(run.benchmark?.id ?? "-") + "</strong>" +
    '<span class="meta-label">Updated</span><strong>' + escapeHtml(formatDate(run.updatedAt)) + "</strong>";
  els.detailPaths.textContent = [
    "Run folder: " + (run.runDirectory ?? "-"),
    "HTML source: " + (assetPath(run, run.assets?.html) || "waiting for index.html"),
    "Prompt: " + (assetPath(run, run.assets?.prompt) || "prompt.md missing"),
    "Preview: " + (assetPath(run, run.assets?.preview) || "preview.png missing"),
    "Video: " + (assetPath(run, run.assets?.video || run.assets?.videoMp4) || "preview video missing")
  ].join("\n");
}

function updateDetailActions(run) {
  const htmlHref = assetHref(run, run.assets?.html);
  setOperationalAvailability(els.openHtml, Boolean(run.runDirectory && run.assets?.html && htmlHref));
  els.openHtml.href = htmlHref ?? "#";

  const canCapture = Boolean(run.runDirectory && run.assets?.html);
  setOperationalAvailability(els.recaptureRun, canCapture);
  setOperationalAvailability(els.deleteRun, Boolean(run.runDirectory));
  syncOperationalControls();

  const canOperate = canUseOperationalControls();
  els.recaptureRun.disabled = !canOperate || !canCapture || state.captureBusy;
  els.deleteRun.disabled = !canOperate || !run.runDirectory;
  if (state.captureBusy && state.captureRunDirectory === run.runDirectory) {
    els.recaptureRun.textContent = "Capturing…";
    return;
  }
  els.recaptureRun.textContent = run.assets?.preview || hasCapturedVideo(run)
    ? "Recapture media"
    : "Capture media";
}

function findRunByDirectoryOrId(run) {
  return state.runs.find((candidate) =>
    (run.runDirectory && candidate.runDirectory === run.runDirectory) ||
    (run.runId && candidate.runId === run.runId)
  );
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
      '<span>Use Capture media in server mode to generate preview.png and preview video from the saved index.html source.</span>' +
      "</span>";
  }

  return '<span class="artifact-empty">' +
    '<strong>' + escapeHtml(run.status === "prepared" ? "Run slot prepared" : "Artifact unavailable") + "</strong>" +
    '<span>' + escapeHtml(run.status === "prepared" ? "Save index.html into the run folder, then run Capture media." : displayRunError(run) ?? "No captured video is available for this run.") + "</span>" +
    "</span>";
}

function setConnection(stateName, label, message) {
  els.connectionMessage.textContent = message;
}

function setLink(link, href) {
  if (href) {
    link.href = href;
    link.hidden = false;
    link.removeAttribute("aria-disabled");
    return true;
  } else {
    link.href = "#";
    link.hidden = true;
    link.setAttribute("aria-disabled", "true");
    return false;
  }
}

/* ── Helpers ──────────────────────────────────────────────── */

function filteredRuns() {
  return state.runs.filter((run) => {
    const modelMatch = state.selectedModel === "all" || run.model?.id === state.selectedModel;
    const benchmarkMatch = state.selectedBenchmark === "all" || run.benchmark?.id === state.selectedBenchmark;
    return modelMatch && benchmarkMatch;
  });
}

function groupRuns(runs, titleForRun, subtitleForRun) {
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

function groupSummary(group, mode) {
  const count = group.subtitles.length;
  const item = mode === "model" ? "prompt" : "model";
  return String(count) + " " + item + (count === 1 ? "" : "s");
}

function modelsFromRuns(runs) {
  return uniqueBy(
    runs
      .map((run) => run.model?.id)
      .filter(Boolean)
      .map((id) => ({ id })),
    (m) => m.id
  );
}

function runsForModel(modelId) {
  return state.runs.filter((run) => run.model?.id === modelId);
}

function runSummaryText(runs) {
  const prepared = runs.filter((r) => r.status === "prepared" && !hasCapturedVideo(r)).length;
  const videoReady = runs.filter((r) => hasCapturedVideo(r)).length;
  const needsCapture = runs.filter((r) => needsMediaCapture(r)).length;
  const failed = runs.filter((r) => r.status === "failed").length;
  return videoReady + " with video, " + needsCapture + " need capture, " + prepared + " prepared, " + failed + " failed";
}

function runCardState(run) {
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

function hasCapturedVideo(run) {
  return Boolean(run.assets?.video || run.assets?.videoMp4);
}

function needsMediaCapture(run) {
  return Boolean(run.runDirectory && run.assets?.html && (!run.assets?.preview || !hasCapturedVideo(run)));
}

function displayRunError(run) {
  const message = run.error?.message;
  if (!message) return null;
  if (/chat completion timed out/iu.test(message)) return "External tool timed out before writing an artifact.";
  if (/LM Studio.*chat completion/iu.test(message)) return "External tool failed to produce an artifact.";
  if (/LM Studio/iu.test(message)) return "External tool error. Open details for the original message.";
  return message;
}

async function fetchJson(url) {
  const response = await fetch(url);
  return readJsonResponse(response);
}

async function fetchStaticManifest() {
  try {
    return await fetchJson("export/manifest.json");
  } catch {
    return fetchJson("/export/manifest.json");
  }
}

async function postJson(url, body) {
  return sendJson(url, "POST", body);
}

async function deleteJson(url, body) {
  return sendJson(url, "DELETE", body);
}

async function sendJson(url, method, body) {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return readJsonResponse(response);
}

async function readJsonResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message ?? "Request failed with HTTP " + response.status + ".");
  }
  return data;
}

function assetPath(run, asset) {
  if (!asset || !run.runDirectory) return "";
  return String(run.runDirectory).replace(/\/+$/u, "") + "/" + asset;
}

function assetHref(run, asset) {
  const path = assetPath(run, asset);
  if (!path) return null;
  if (/^[a-z][a-z0-9+.-]*:/iu.test(path)) return path;
  if (state.staticMode || path.startsWith("export/")) return path.replace(/^\/+/u, "");
  return "/api/run-asset?runDirectory=" + encodeURIComponent(run.runDirectory) + "&asset=" + encodeURIComponent(asset);
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

function uniqueBy(items, keyForItem) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyForItem(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return "Unavailable";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return size.toFixed(unitIndex === 0 ? 0 : 1) + " " + units[unitIndex];
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function formatDateShort(value) {
  return value
    ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "-";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
