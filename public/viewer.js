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
  syncBusy: false,
  runs: [],
  stats: null,
  selectedModel: "all",
  selectedBenchmark: "all",
  mode: "gallery",
  preparedPrompt: ""
};

const els = {
  // Header / system
  statsPill: document.querySelector("#statsPill"),
  statsDot: document.querySelector("#statsDot"),
  statsCompact: document.querySelector("#statsCompact"),
  // Toggles
  setupToggle: document.querySelector("#setupToggle"),
  runToggle: document.querySelector("#runToggle"),
  lmStudioToggle: document.querySelector("#lmStudioToggle"),
  // Modals
  detailBackdrop: document.querySelector("#detailBackdrop"),
  closeDetail: document.querySelector("#closeDetail"),
  prepBackdrop: document.querySelector("#prepBackdrop"),
  closePrep: document.querySelector("#closePrep"),
  setupBackdrop: document.querySelector("#setupBackdrop"),
  closeSetup: document.querySelector("#closeSetup"),
  lmStudioBackdrop: document.querySelector("#lmStudioBackdrop"),
  closeLmStudio: document.querySelector("#closeLmStudio"),
  // LM Studio inside modal
  baseUrl: document.querySelector("#baseUrl"),
  refreshConnection: document.querySelector("#refreshConnection"),
  connectionMessage: document.querySelector("#connectionMessage"),
  availableModelChoices: document.querySelector("#availableModelChoices"),
  availableModelCount: document.querySelector("#availableModelCount"),
  syncPanel: document.querySelector("#syncPanel"),
  syncModeBadge: document.querySelector("#syncModeBadge"),
  syncMessage: document.querySelector("#syncMessage"),
  mirrorPi: document.querySelector("#mirrorPi"),
  mirrorOpenCode: document.querySelector("#mirrorOpenCode"),
  mirrorBoth: document.querySelector("#mirrorBoth"),
  // Filters
  modelFilter: document.querySelector("#modelFilter"),
  benchmarkFilter: document.querySelector("#benchmarkFilter"),
  // Prepare run
  prepBenchmark: document.querySelector("#prepBenchmark"),
  prepModelSelect: document.querySelector("#prepModelSelect"),
  prepModel: document.querySelector("#prepModel"),
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
  // Detail
  detailTitle: document.querySelector("#detailTitle"),
  detailSubtitle: document.querySelector("#detailSubtitle"),
  detailPreview: document.querySelector("#detailPreview"),
  detailActions: document.querySelector("#detailActions"),
  htmlLink: document.querySelector("#htmlLink"),
  promptLink: document.querySelector("#promptLink"),
  rawLink: document.querySelector("#rawLink"),
  detailPrompt: document.querySelector("#detailPrompt"),
  promptLength: document.querySelector("#promptLength"),
  detailMeta: document.querySelector("#detailMeta"),
  detailPaths: document.querySelector("#detailPaths")
};

init();

function init() {
  wireEvents();
  void loadLocalData();
  setInterval(() => {
    if (!state.staticMode) {
      void loadStats();
    }
  }, 5000);
  setInterval(() => {
    if (!state.staticMode) {
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
  els.mirrorPi.addEventListener("click", () => mirrorModels(["pi"]));
  els.mirrorOpenCode.addEventListener("click", () => mirrorModels(["opencode"]));
  els.mirrorBoth.addEventListener("click", () => mirrorModels(["opencode", "pi"]));

  els.setupToggle.addEventListener("click", () => openModal("setup"));
  els.runToggle.addEventListener("click", () => openModal("prep"));
  els.lmStudioToggle.addEventListener("click", () => openModal("lmStudio"));

  els.closeDetail.addEventListener("click", () => closeModal("detail"));
  els.closePrep.addEventListener("click", () => closeModal("prep"));
  els.closeSetup.addEventListener("click", () => closeModal("setup"));
  els.closeLmStudio.addEventListener("click", () => closeModal("lmStudio"));

  els.detailBackdrop.addEventListener("click", (event) => {
    if (event.target === els.detailBackdrop) closeModal("detail");
  });
  els.prepBackdrop.addEventListener("click", (event) => {
    if (event.target === els.prepBackdrop) closeModal("prep");
  });
  els.setupBackdrop.addEventListener("click", (event) => {
    if (event.target === els.setupBackdrop) closeModal("setup");
  });
  els.lmStudioBackdrop.addEventListener("click", (event) => {
    if (event.target === els.lmStudioBackdrop) closeModal("lmStudio");
  });

  els.prepModelSelect.addEventListener("change", () => {
    if (els.prepModelSelect.value) {
      els.prepModel.value = els.prepModelSelect.value;
    }
  });

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

function openModal(name) {
  const map = {
    detail: els.detailBackdrop,
    prep: els.prepBackdrop,
    setup: els.setupBackdrop,
    lmStudio: els.lmStudioBackdrop
  };
  const el = map[name];
  if (el) {
    el.setAttribute("open", "");
    document.body.style.overflow = "hidden";
  }
  if (name === "prep" && state.staticMode) {
    els.prepareRun.disabled = true;
    els.prepMessage.textContent = "Static mode cannot create local folders.";
  } else if (name === "prep") {
    els.prepareRun.disabled = false;
    els.prepMessage.textContent = "The app will create the folder, metadata.json, and prompt.md.";
  }
  if (name === "lmStudio") {
    updateMirrorControls();
  }
}

function closeModal(name) {
  const map = {
    detail: els.detailBackdrop,
    prep: els.prepBackdrop,
    setup: els.setupBackdrop,
    lmStudio: els.lmStudioBackdrop
  };
  const el = map[name];
  if (el) {
    el.removeAttribute("open");
    document.body.style.overflow = "";
  }
}

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
    setConnection("static", "Static", "Browsing exported runs. Prepare-run needs the local API.");
    els.statsDot.dataset.state = "static";
    els.statsCompact.textContent = "Static";
    renderBenchmarks();
    renderModels();
    renderModelSources();
    renderPrepOptions();
    renderRuns();
    updateMirrorControls();
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
    els.refreshConnection.textContent = "Testing...";
    setConnection("checking", "Checking", "Checking LM Studio and refreshing the model inventory...");
  }

  try {
    const status = await fetchJson("/api/status?baseUrl=" + encodeURIComponent(els.baseUrl.value));
    if (status.lmStudio?.baseUrl) {
      els.baseUrl.value = status.lmStudio.baseUrl;
    }
    const connection = status.lmStudio?.connection;
    if (connection?.ok) {
      const modelCount = await loadModels();
      await loadModelSyncState();
      setConnection(
        "online",
        "Online",
        "LM Studio is reachable. Refreshed " + modelCount + " current " + (modelCount === 1 ? "model" : "models") + ". Model execution still stays outside this app."
      );
    } else {
      setConnection("offline", "Offline", connection?.error ?? "LM Studio is not reachable.");
      await loadModels();
      await loadModelSyncState();
    }
  } catch (error) {
    setConnection("offline", "Offline", error.message);
    state.discoveredModels = [];
    renderModelSources();
    renderPrepOptions();
    updateMirrorControls();
  } finally {
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
    updateMirrorControls();
    return discovered.length;
  } catch {
    state.discoveredModels = [];
    renderModelSources();
    renderPrepOptions();
    updateMirrorControls();
    return 0;
  }
}

async function loadModelSyncState() {
  if (state.staticMode) {
    state.modelSync.enabled = false;
    els.syncPanel.hidden = true;
    updateMirrorControls();
    return;
  }

  try {
    const data = await fetchJson("/api/model-sync");
    state.modelSync = data.sync ?? state.modelSync;
    els.syncPanel.hidden = !state.modelSync.enabled;
    els.syncModeBadge.textContent = state.modelSync.enabled ? "Enabled" : "Disabled";
    if (!state.modelSync.enabled) {
      els.syncMessage.textContent = "Mirror mode is only enabled in local dev server mode.";
    } else {
      els.syncMessage.textContent = "Mirror uses current LM Studio model IDs and rewrites only the LM Studio sections in Pi/OpenCode.";
    }
    renderModelSources();
  } catch (error) {
    state.modelSync.enabled = false;
    els.syncPanel.hidden = true;
    els.syncModeBadge.textContent = "Unavailable";
    els.syncMessage.textContent = "Mirror mode unavailable: " + error.message;
  } finally {
    updateMirrorControls();
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
    const gpu = state.stats?.gpu?.devices?.[0]?.name ?? "GPU unavailable";
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
  const data = await fetchJson("/api/runs");
  state.runs = data.runs ?? [];
  renderModels();
  renderModelSources();
  renderPrepOptions();
  renderRuns();
}

async function prepareRunSlot() {
  if (state.staticMode) {
    els.prepMessage.textContent = "Static mode cannot create local folders.";
    return;
  }
  const benchmarkId = els.prepBenchmark.value;
  const modelId = els.prepModel.value.trim();
  if (!benchmarkId || !modelId) {
    els.prepMessage.textContent = "Choose a prompt and enter a model ID.";
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
    els.prepResult.hidden = false;
    state.runs = [availablePreparedRun(prepared.run), ...state.runs.filter((run) => run.runId !== prepared.run.runId)];
    renderModels();
    renderModelSources();
    renderPrepOptions();
    renderRuns();
  } catch (error) {
    els.prepMessage.textContent = error.message;
    els.prepResult.hidden = true;
  }
}

async function copyPreparedPrompt() {
  if (!els.preparedPrompt.value) {
    return;
  }
  await navigator.clipboard.writeText(els.preparedPrompt.value);
  els.prepMessage.textContent = "Prompt copied.";
}

function renderBenchmarks() {
  els.benchmarkFilter.innerHTML = [
    '<option value="all">All prompts</option>',
    ...state.benchmarks.map((benchmark) =>
      '<option value="' + escapeAttribute(benchmark.id) + '">' + escapeHtml(benchmark.title) + "</option>"
    )
  ].join("");
}

function renderModels() {
  const runModels = modelsFromRuns(state.runs);
  if (state.selectedModel !== "all" && !runModels.some((model) => model.id === state.selectedModel)) {
    state.selectedModel = "all";
    els.modelFilter.value = "all";
  }
  els.modelFilter.innerHTML = [
    '<option value="all">All run models</option>',
    ...runModels.map((model) =>
      '<option value="' + escapeAttribute(model.id) + '">' + escapeHtml(model.id) + "</option>"
    )
  ].join("");
}

function renderModelSources() {
  renderModelInventory();
}

function renderModelInventory() {
  const runModels = modelsFromRuns(state.runs);
  const currentIds = new Set(state.discoveredModels.map((model) => model.id));
  const runIds = new Set(runModels.map((model) => model.id));
  const models = uniqueBy(
    [
      ...state.discoveredModels,
      ...runModels
    ],
    (model) => model.id
  );
  const opencodeModelIds = new Set(state.modelSync.files?.opencode?.modelIds ?? []);
  const piModelIds = new Set(state.modelSync.files?.pi?.modelIds ?? []);

  els.availableModelCount.textContent = String(models.length);
  if (models.length === 0) {
    els.availableModelChoices.innerHTML = '<p class="muted-copy text-sm leading-5">LM Studio did not return models and no run folders are indexed yet. Preparing a slot still allows a typed model ID.</p>';
    return;
  }

  els.availableModelChoices.innerHTML = models
    .map((model) => {
      const isCurrent = currentIds.has(model.id);
      const hasRuns = runIds.has(model.id);
      const runCount = runsForModel(model.id).length;
      const inOpenCode = opencodeModelIds.has(model.id);
      const inPi = piModelIds.has(model.id);
      return (
        '<span class="available-model">' +
          '<span class="model-row-title truncate-line">' + escapeHtml(model.id) + "</span>" +
          '<span class="model-row-meta">' +
            (isCurrent ? '<span class="source-chip current">current</span>' : "") +
            (hasRuns ? '<span class="source-chip saved">' + escapeHtml(runCount + " saved " + (runCount === 1 ? "run" : "runs")) + "</span>" : "") +
            (inOpenCode ? '<span class="source-chip synced">opencode</span>' : "") +
            (inPi ? '<span class="source-chip synced">pi</span>' : "") +
            (!isCurrent && hasRuns ? '<span class="source-chip historical">filesystem only</span>' : "") +
            (!hasRuns ? '<span class="muted-copy">No saved runs</span>' : "") +
          "</span>" +
        "</span>"
      );
    })
    .join("");
}

function updateMirrorControls() {
  const canMirror =
    !state.staticMode &&
    state.modelSync.enabled &&
    state.discoveredModels.length > 0 &&
    !state.syncBusy;

  els.mirrorPi.disabled = !canMirror;
  els.mirrorOpenCode.disabled = !canMirror;
  els.mirrorBoth.disabled = !canMirror;
}

async function mirrorModels(targets) {
  if (state.staticMode) {
    els.syncMessage.textContent = "Mirror mode is unavailable while browsing static exports.";
    return;
  }

  const discoveredIds = state.discoveredModels
    .map((model) => model.id)
    .filter((id) => typeof id === "string" && id.length > 0);

  if (discoveredIds.length === 0) {
    els.syncMessage.textContent = "No discovered LM Studio models to mirror.";
    return;
  }

  state.syncBusy = true;
  updateMirrorControls();
  const originalLabel = els.mirrorBoth.textContent;
  els.mirrorBoth.textContent = "Mirroring...";
  els.syncMessage.textContent = "Applying mirror mode to " + targets.join(" + ") + "...";

  try {
    const data = await postJson("/api/model-sync", {
      baseUrl: els.baseUrl.value,
      modelIds: discoveredIds,
      targets
    });
    state.modelSync = data.sync ?? state.modelSync;
    renderModelSources();
    els.syncMessage.textContent =
      "Mirrored " +
      String(data.mirroredModelCount ?? discoveredIds.length) +
      " model IDs to " +
      targets.join(" + ") +
      ".";
  } catch (error) {
    els.syncMessage.textContent = "Mirror failed: " + error.message;
  } finally {
    state.syncBusy = false;
    els.mirrorBoth.textContent = originalLabel;
    updateMirrorControls();
  }
}

function renderPrepOptions() {
  els.prepBenchmark.innerHTML = state.benchmarks
    .map((benchmark) => '<option value="' + escapeAttribute(benchmark.id) + '"\u003e' + escapeHtml(benchmark.title) + "</option\u003e")
    .join("");
  els.prepModelSelect.innerHTML = [
    '<option value="">Choose discovered model</option>',
    ...state.discoveredModels.map((model) => '<option value="' + escapeAttribute(model.id) + '"\u003e' + escapeHtml(model.id) + "</option>")
  ].join("");
  if (!els.prepModel.value && state.discoveredModels[0]) {
    els.prepModel.value = state.discoveredModels[0].id;
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
      : "Browse saved local artifacts.";

  if (runs.length === 0) {
    els.runsSurface.innerHTML = '<div class="empty">No runs match the current filters. <button type="button" class="btn-sm-ghost" id="emptyPrepRun">Prepare a run</button> or refresh after your external tool writes files.</div>';
    const emptyPrep = document.querySelector("#emptyPrepRun");
    if (emptyPrep) {
      emptyPrep.addEventListener("click", () => openModal("prep"));
    }
    return;
  }

  if (state.mode === "model") {
    renderGroupedRuns(groupRuns(runs, (run) => run.model?.id ?? "Unknown model", (run) => run.benchmark?.title ?? run.benchmark?.id ?? "Unknown prompt"));
    return;
  }

  if (state.mode === "benchmark") {
    renderGroupedRuns(groupRuns(runs, (run) => run.benchmark?.title ?? run.benchmark?.id ?? "Unknown prompt", (run) => run.model?.id ?? "Unknown model"));
    return;
  }

  els.runsSurface.innerHTML = '<div class="run-grid">' + runs.map(renderRunCard).join("") + "</div>";
  wireRunCards();
}

function renderGroupedRuns(groups) {
  els.runsSurface.innerHTML = groups.map((group) =>
    '<section class="group">' +
      '<div class="group-head">' +
        "<div>" +
          '<h3 class="text-base font-semibold tracking-[-0.01em]">' + escapeHtml(group.title) + "</h3>" +
          '<p class="muted-copy mt-1 text-sm">' + escapeHtml(group.subtitle) + "</p>" +
        "</div>" +
        '<span class="badge-outline">' + group.runs.length + "</span>" +
      "</div>" +
      '<div class="run-grid">' + group.runs.map(renderRunCard).join("") + "</div>" +
    "</section>"
  ).join("");
  wireRunCards();
}

function renderRunCard(run) {
  const htmlHref = assetHref(run, run.assets?.html);
  const stateLabel = runCardState(run);
  return (
    '<button class="run-card" type="button" data-run-id="' + escapeAttribute(run.runId) + '" aria-label="' +
    escapeAttribute(run.benchmark?.title ?? "Run") + " " + escapeAttribute(run.model?.id ?? "") + '">' +
      renderPreview(run) +
      '<span class="run-card-body">' +
        '<span class="grid min-w-0 gap-1">' +
          '<strong class="truncate-line text-sm font-semibold">' + escapeHtml(run.benchmark?.title ?? run.benchmark?.id ?? "Untitled run") + "</strong>" +
          '<span class="muted-copy truncate-line text-sm">' + escapeHtml(run.model?.id ?? "Unknown model") + "</span>" +
        "</span>" +
        '<span class="flex items-center justify-between gap-3">' +
          '<span class="inline-flex items-center gap-2 rounded-full border px-2 py-1 text-[0.72rem] font-medium text-muted-foreground">' +
            '<span class="status-dot" data-status="' + escapeAttribute(stateLabel.status) + '"></span>' +
            escapeHtml(stateLabel.label) +
          "</span>" +
          '<span class="muted-copy truncate-line text-xs">' + escapeHtml(formatDateShort(run.updatedAt ?? run.createdAt)) + "</span>" +
        "</span>" +
        '<span class="muted-copy text-sm">' + escapeHtml(htmlHref ? "Artifact ready" : "Waiting for index.html") + "</span>" +
      "</span>" +
    "</button>"
  );
}

function renderPreview(run) {
  const previewHref = assetHref(run, run.assets?.preview);
  if (previewHref) {
    return '<span class="preview"><img src="' + escapeAttribute(previewHref) + '" alt="" loading="lazy" /></span>';
  }

  return (
    '<span class="preview">' +
      '<span class="preview-placeholder">' +
        "<strong>" + escapeHtml(run.assets?.html ? "HTML artifact" : "No preview yet") + "</strong>" +
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
  els.detailTitle.textContent = run.benchmark?.title ?? "Run detail";
  els.detailSubtitle.textContent = (run.model?.id ?? "Unknown model") + " \u00b7 " + (run.runId ?? "");
  els.detailPreview.innerHTML = renderDetailArtifact(run);
  const hasHtml = setLink(els.htmlLink, assetHref(run, run.assets?.html));
  const hasPrompt = setLink(els.promptLink, assetHref(run, run.assets?.prompt));
  const hasRaw = setLink(els.rawLink, assetHref(run, run.assets?.rawResponse));
  els.detailActions.hidden = !(hasHtml || hasPrompt || hasRaw);
  const prompt = run.benchmark?.prompt ?? "Prompt unavailable in metadata.";
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
    "HTML: " + (assetPath(run, run.assets?.html) || "waiting for index.html"),
    "Prompt: " + (assetPath(run, run.assets?.prompt) || "prompt.md missing"),
    "Preview: " + (assetPath(run, run.assets?.preview) || "preview.png missing")
  ].join("\n");
  openModal("detail");
}

function renderDetailArtifact(run) {
  const htmlHref = assetHref(run, run.assets?.html);
  if (htmlHref) {
    return '<iframe class="artifact-frame" src="' + escapeAttribute(htmlHref) + '" title="' + escapeAttribute(run.benchmark?.title ?? "Run artifact") + '" loading="lazy"></iframe>';
  }

  const previewHref = assetHref(run, run.assets?.preview);
  if (previewHref) {
    return '<span class="artifact-image"><img src="' + escapeAttribute(previewHref) + '" alt="" /></span>';
  }

  return '<span class="artifact-empty">' +
    '<strong>' + escapeHtml(run.status === "prepared" ? "Run slot prepared" : "Artifact unavailable") + "</strong>" +
    '<span>' + escapeHtml(run.status === "prepared" ? "Save index.html into the run folder, then refresh." : displayRunError(run) ?? "No index.html or preview.png found in this run folder.") + "</span>" +
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
  return Array.from(groups.values()).map((group) => ({
    title: group.title,
    subtitle: Array.from(group.subtitles).slice(0, 3).join(" \u00b7 "),
    runs: group.runs
  }));
}

function modelsFromRuns(runs) {
  return uniqueBy(
    runs
      .map((run) => run.model?.id)
      .filter(Boolean)
      .map((id) => ({ id })),
    (model) => model.id
  );
}

function runsForModel(modelId) {
  return state.runs.filter((run) => run.model?.id === modelId);
}

function runSummaryText(runs) {
  const prepared = runs.filter((run) => run.status === "prepared").length;
  const completed = runs.filter((run) => run.assets?.html).length;
  const failed = runs.filter((run) => run.status === "failed").length;
  return completed + " with HTML, " + prepared + " prepared, " + failed + " failed";
}

function runCardState(run) {
  if (run.assets?.html) {
    return { status: "completed", label: "ready" };
  }
  if (run.status === "failed" || run.status === "cancelled") {
    return { status: run.status, label: run.status };
  }
  return { status: "prepared", label: "slot" };
}

function displayRunError(run) {
  const message = run.error?.message;
  if (!message) {
    return null;
  }

  if (/chat completion timed out/iu.test(message)) {
    return "External tool timed out before writing an artifact.";
  }

  if (/LM Studio.*chat completion/iu.test(message)) {
    return "External tool failed to produce an artifact.";
  }

  if (/LM Studio/iu.test(message)) {
    return "External tool error. Open details for the original message.";
  }

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
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
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
  if (!asset || !run.runDirectory) {
    return "";
  }
  return String(run.runDirectory).replace(/\/+$/u, "") + "/" + asset;
}

function assetHref(run, asset) {
  const path = assetPath(run, asset);
  if (!path) {
    return null;
  }
  if (/^[a-z][a-z0-9+.-]*:/iu.test(path)) {
    return path;
  }
  if (state.staticMode || path.startsWith("export/")) {
    return path.replace(/^\/+/u, "");
  }
  return "/api/run-asset?runDirectory=" +
    encodeURIComponent(run.runDirectory) +
    "&asset=" +
    encodeURIComponent(asset);
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
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function formatBytes(value) {
  if (!Number.isFinite(value)) {
    return "Unavailable";
  }
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
