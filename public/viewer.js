const state = {
  staticMode: false,
  benchmarks: [],
  models: [],
  runs: [],
  stats: null,
  selectedModel: "all",
  selectedBenchmark: "all",
  mode: "gallery",
  preparedPrompt: ""
};

const els = {
  baseUrl: document.querySelector("#baseUrl"),
  refreshConnection: document.querySelector("#refreshConnection"),
  connectionPill: document.querySelector("#connectionPill"),
  connectionMessage: document.querySelector("#connectionMessage"),
  modelChoices: document.querySelector("#modelChoices"),
  modelCount: document.querySelector("#modelCount"),
  benchmarkChoices: document.querySelector("#benchmarkChoices"),
  benchmarkCount: document.querySelector("#benchmarkCount"),
  statsTime: document.querySelector("#statsTime"),
  systemSummary: document.querySelector("#systemSummary"),
  setupToggle: document.querySelector("#setupToggle"),
  runToggle: document.querySelector("#runToggle"),
  setupPanel: document.querySelector("#setupPanel"),
  prepPanel: document.querySelector("#prepPanel"),
  refreshRuns: document.querySelector("#refreshRuns"),
  prepBenchmark: document.querySelector("#prepBenchmark"),
  prepModelSelect: document.querySelector("#prepModelSelect"),
  prepModel: document.querySelector("#prepModel"),
  prepTool: document.querySelector("#prepTool"),
  prepareRun: document.querySelector("#prepareRun"),
  prepMessage: document.querySelector("#prepMessage"),
  preparedPrompt: document.querySelector("#preparedPrompt"),
  preparedPaths: document.querySelector("#preparedPaths"),
  copyPrompt: document.querySelector("#copyPrompt"),
  viewTitle: document.querySelector("#viewTitle"),
  viewSubtitle: document.querySelector("#viewSubtitle"),
  runSummary: document.querySelector("#runSummary"),
  runCount: document.querySelector("#runCount"),
  runsSurface: document.querySelector("#runsSurface"),
  detailBackdrop: document.querySelector("#detailBackdrop"),
  closeDetail: document.querySelector("#closeDetail"),
  detailTitle: document.querySelector("#detailTitle"),
  detailSubtitle: document.querySelector("#detailSubtitle"),
  detailPreview: document.querySelector("#detailPreview"),
  htmlLink: document.querySelector("#htmlLink"),
  promptLink: document.querySelector("#promptLink"),
  rawLink: document.querySelector("#rawLink"),
  detailPrompt: document.querySelector("#detailPrompt"),
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
}

function wireEvents() {
  els.refreshConnection.addEventListener("click", () => loadConnection());
  els.refreshRuns.addEventListener("click", () => refreshRuns());
  els.setupToggle.addEventListener("click", () => togglePanel("setup"));
  els.runToggle.addEventListener("click", () => togglePanel("prep"));
  els.prepModelSelect.addEventListener("change", () => {
    if (els.prepModelSelect.value) {
      els.prepModel.value = els.prepModelSelect.value;
    }
  });
  els.prepareRun.addEventListener("click", () => prepareRunSlot());
  els.copyPrompt.addEventListener("click", () => copyPreparedPrompt());
  els.closeDetail.addEventListener("click", closeDetail);
  els.detailBackdrop.addEventListener("click", (event) => {
    if (event.target === els.detailBackdrop) {
      closeDetail();
    }
  });
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      renderModeButtons();
      renderRuns();
    });
  });
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
    renderRuns();
    renderPrepOptions();
    await Promise.allSettled([loadConnection(), loadStats()]);
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
    state.models = modelsFromRuns(state.runs);
    setConnection("static", "Static", "Browsing exported runs. Prepare-run needs the local API.");
    els.prepareRun.disabled = true;
    els.statsTime.textContent = "Static";
    els.systemSummary.textContent = "System stats require the local API.";
    renderBenchmarks();
    renderModels();
    renderPrepOptions();
    renderRuns();
  } catch (staticError) {
    setConnection(
      "offline",
      "Unavailable",
      (reason?.message ?? "Local API unavailable.") + " " + staticError.message
    );
    els.runsSurface.innerHTML = '<div class="empty">No local API or static export was found.</div>';
  }
}

async function loadConnection() {
  try {
    const status = await fetchJson("/api/status?baseUrl=" + encodeURIComponent(els.baseUrl.value));
    if (status.lmStudio?.baseUrl) {
      els.baseUrl.value = status.lmStudio.baseUrl;
    }
    const connection = status.lmStudio?.connection;
    if (connection?.ok) {
      setConnection("online", "Online", "LM Studio is reachable. Model execution still stays outside this app.");
    } else {
      setConnection("offline", "Offline", connection?.error ?? "LM Studio is not reachable.");
    }
    await loadModels();
  } catch (error) {
    setConnection("offline", "Offline", error.message);
    state.models = modelsFromRuns(state.runs);
    renderModels();
    renderPrepOptions();
  }
}

async function loadModels() {
  try {
    const data = await fetchJson("/api/lmstudio/models?baseUrl=" + encodeURIComponent(els.baseUrl.value));
    const discovered = data.models ?? [];
    state.models = mergeModels(discovered, modelsFromRuns(state.runs));
    renderModels();
    renderPrepOptions();
  } catch {
    state.models = modelsFromRuns(state.runs);
    renderModels();
    renderPrepOptions();
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
    els.statsTime.textContent = new Date().toLocaleTimeString();
    els.systemSummary.textContent = cpu + ". " + memory + ". " + gpu + ".";
  } catch (error) {
    els.systemSummary.textContent = error.message;
  }
}

async function refreshRuns() {
  if (state.staticMode) {
    await enterStaticMode(new Error("Static refresh"));
    return;
  }
  const data = await fetchJson("/api/runs");
  state.runs = data.runs ?? [];
  state.models = mergeModels(state.models, modelsFromRuns(state.runs));
  renderModels();
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
      modelId,
      tool: els.prepTool.value
    });
    const prepared = data.preparedRun;
    state.preparedPrompt = prepared.prompt;
    els.preparedPrompt.value = prepared.prompt;
    els.preparedPaths.textContent = "Run folder: " + prepared.paths.runDirectory;
    els.prepMessage.textContent = "Run slot prepared. Paste the prompt into your external tool.";
    state.runs = [prepared.run, ...state.runs.filter((run) => run.runId !== prepared.run.runId)];
    state.models = mergeModels(state.models, [{ id: modelId }]);
    renderModels();
    renderRuns();
  } catch (error) {
    els.prepMessage.textContent = error.message;
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
  els.benchmarkCount.textContent = String(state.benchmarks.length);
  const options = [
    choiceMarkup("benchmark", "all", "All prompts", state.runs.length + " runs", state.selectedBenchmark === "all"),
    ...state.benchmarks.map((benchmark) =>
      choiceMarkup(
        "benchmark",
        benchmark.id,
        benchmark.title,
        benchmark.description,
        state.selectedBenchmark === benchmark.id
      )
    )
  ];
  els.benchmarkChoices.innerHTML = options.join("");
  els.benchmarkChoices.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      state.selectedBenchmark = input.value;
      renderRuns();
    });
  });
}

function renderModels() {
  els.modelCount.textContent = String(state.models.length);
  const options = [
    choiceMarkup("model", "all", "All models", "Compare every saved run", state.selectedModel === "all"),
    ...state.models.map((model) =>
      choiceMarkup(
        "model",
        model.id,
        model.id,
        runsForModel(model.id).length + " runs",
        state.selectedModel === model.id
      )
    )
  ];
  els.modelChoices.innerHTML = options.join("");
  els.modelChoices.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      state.selectedModel = input.value;
      renderRuns();
    });
  });
}

function renderPrepOptions() {
  els.prepBenchmark.innerHTML = state.benchmarks
    .map((benchmark) => '<option value="' + escapeAttribute(benchmark.id) + '">' + escapeHtml(benchmark.title) + "</option>")
    .join("");
  els.prepModelSelect.innerHTML = [
    '<option value="">Choose discovered model</option>',
    ...state.models.map((model) => '<option value="' + escapeAttribute(model.id) + '">' + escapeHtml(model.id) + "</option>")
  ].join("");
  if (!els.prepModel.value && state.models[0]) {
    els.prepModel.value = state.models[0].id;
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
    els.runsSurface.innerHTML = '<div class="empty">No runs match the current filters. Prepare a slot or refresh after your external tool writes files.</div>';
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
          "<h3>" + escapeHtml(group.title) + "</h3>" +
          '<p class="small">' + escapeHtml(group.subtitle) + "</p>" +
        "</div>" +
        '<span class="count">' + group.runs.length + "</span>" +
      "</div>" +
      '<div class="run-grid">' + group.runs.map(renderRunCard).join("") + "</div>" +
    "</section>"
  ).join("");
  wireRunCards();
}

function renderRunCard(run) {
  const index = state.runs.indexOf(run);
  const htmlHref = assetHref(run, run.assets?.html);
  return (
    '<button class="run-card" type="button" data-run-index="' + index + '" aria-label="' +
    escapeAttribute(run.benchmark?.title ?? "Run") + " " + escapeAttribute(run.model?.id ?? "") + '">' +
      renderPreview(run) +
      '<span class="run-body">' +
        '<span class="run-title">' +
          "<strong>" + escapeHtml(run.benchmark?.title ?? run.benchmark?.id ?? "Untitled run") + "</strong>" +
          '<span class="small truncate">' + escapeHtml(run.model?.id ?? "Unknown model") + "</span>" +
        "</span>" +
        '<span class="card-foot">' +
          '<span class="status" data-status="' + escapeAttribute(run.status ?? "prepared") + '">' + escapeHtml(run.status ?? "unknown") + "</span>" +
          '<span class="small">' + escapeHtml(formatDateShort(run.updatedAt ?? run.createdAt)) + "</span>" +
        "</span>" +
        '<span class="small">' + (htmlHref ? "HTML ready" : "Waiting for index.html") + "</span>" +
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
        '<span class="small">' + escapeHtml(run.status === "prepared" ? "Paste the prompt into your tool." : run.error?.message ?? "Add preview.png for gallery thumbnails.") + "</span>" +
      "</span>" +
    "</span>"
  );
}

function wireRunCards() {
  els.runsSurface.querySelectorAll("[data-run-index]").forEach((button) => {
    button.addEventListener("click", () => {
      openDetail(state.runs[Number(button.dataset.runIndex)]);
    });
  });
}

function openDetail(run) {
  els.detailTitle.textContent = run.benchmark?.title ?? "Run detail";
  els.detailSubtitle.textContent = (run.model?.id ?? "Unknown model") + " · " + (run.runId ?? "");
  els.detailPreview.innerHTML = renderPreview(run);
  setLink(els.htmlLink, assetHref(run, run.assets?.html));
  setLink(els.promptLink, assetHref(run, run.assets?.prompt));
  setLink(els.rawLink, assetHref(run, run.assets?.rawResponse));
  els.detailPrompt.textContent = run.benchmark?.prompt ?? "Prompt unavailable in metadata.";
  els.detailMeta.innerHTML =
    '<span class="label">Status</span><strong>' + escapeHtml(run.status ?? "-") + "</strong>" +
    '<span class="label">Model</span><strong>' + escapeHtml(run.model?.id ?? "-") + "</strong>" +
    '<span class="label">Prompt</span><strong>' + escapeHtml(run.benchmark?.id ?? "-") + "</strong>" +
    '<span class="label">Created</span><strong>' + escapeHtml(formatDate(run.createdAt)) + "</strong>" +
    '<span class="label">Updated</span><strong>' + escapeHtml(formatDate(run.updatedAt)) + "</strong>" +
    '<span class="label">Tool</span><strong>' + escapeHtml(run.tool ?? "-") + "</strong>" +
    '<span class="label">Error</span><strong>' + escapeHtml(run.error?.message ?? "-") + "</strong>";
  els.detailPaths.textContent = [
    "Run folder: " + (run.runDirectory ?? "-"),
    "HTML: " + (assetPath(run, run.assets?.html) || "waiting for index.html"),
    "Prompt: " + (assetPath(run, run.assets?.prompt) || "prompt.md missing"),
    "Preview: " + (assetPath(run, run.assets?.preview) || "preview.png missing")
  ].join("\n");
  els.detailBackdrop.setAttribute("open", "");
}

function closeDetail() {
  els.detailBackdrop.removeAttribute("open");
}

function togglePanel(panel) {
  const target = panel === "setup" ? els.setupPanel : els.prepPanel;
  const other = panel === "setup" ? els.prepPanel : els.setupPanel;
  const nextHidden = !target.hidden;
  target.hidden = nextHidden;
  if (!nextHidden) {
    other.hidden = true;
  }
}

function setConnection(stateName, label, message) {
  els.connectionPill.dataset.state = stateName;
  els.connectionPill.textContent = label;
  els.connectionMessage.textContent = message;
}

function setLink(link, href) {
  if (href) {
    link.href = href;
    link.removeAttribute("aria-disabled");
  } else {
    link.href = "#";
    link.setAttribute("aria-disabled", "true");
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
    subtitle: Array.from(group.subtitles).slice(0, 3).join(" · "),
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

function mergeModels(left, right) {
  return uniqueBy([...left, ...right], (model) => model.id).sort((a, b) => a.id.localeCompare(b.id));
}

function runsForModel(modelId) {
  return state.runs.filter((run) => run.model?.id === modelId);
}

function choiceMarkup(name, value, title, description, checked) {
  return (
    '<label class="choice">' +
      '<input type="radio" name="' + name + '" value="' + escapeAttribute(value) + '" ' + (checked ? "checked" : "") + " />" +
      "<span>" +
        '<strong class="truncate">' + escapeHtml(title) + "</strong>" +
        '<span class="small">' + escapeHtml(description ?? "") + "</span>" +
      "</span>" +
    "</label>"
  );
}

function runSummaryText(runs) {
  const prepared = runs.filter((run) => run.status === "prepared").length;
  const completed = runs.filter((run) => run.assets?.html).length;
  const failed = runs.filter((run) => run.status === "failed").length;
  return completed + " with HTML, " + prepared + " prepared, " + failed + " failed";
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
  return "file://" + path.split("/").map(encodeURIComponent).join("/");
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
    .replace(/"/gu, "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/gu, "&#39;");
}
