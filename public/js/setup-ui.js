import { els } from "./dom.js";
import { state } from "./state.js";
import { modelsFromRuns } from "./runs.js";
import { canUseOperationalControls } from "./operational-controls.js";
import { escapeAttribute, escapeHtml, uniqueBy } from "./utils.js";

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

/* ── Setup panel state ──────────────────────────────────────── */

export function updateLmStepStates() {
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

export function updateConfigPresence() {
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

export function updateSyncButtons() {
  const canSync =
    canUseOperationalControls() &&
    state.modelSync.enabled &&
    state.lmStudioModels.length > 0 &&
    !state.syncBusy;

  els.syncPiBtn.disabled = !canSync;
  els.syncOpenCodeBtn.disabled = !canSync;
}

/* ── Model inventory rendering ──────────────────────────────── */

export function renderModelInventory() {
  const runModels = modelsFromRuns(state.runs);
  const currentKeys = new Set(state.discoveredModels.map(modelKey));
  const runIds = new Set(runModels.map((m) => m.id));
  const opencodeModelIds = new Set(state.modelSync.files?.opencode?.modelIds ?? []);
  const piModelIds = new Set(state.modelSync.files?.pi?.modelIds ?? []);
  const piExists = state.modelSync.files?.pi?.exists ?? false;
  const ocExists = state.modelSync.files?.opencode?.exists ?? false;

  const liveModelIds = new Set(state.discoveredModels.map((model) => model.id));
  const historyModels = runModels.filter((model) => !liveModelIds.has(model.id));
  const models = uniqueBy(
    [...state.discoveredModels, ...historyModels],
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

export function modelSourceLabel(source) {
  if (source === "omlx") return "oMLX";
  if (source === "lmstudio") return "LM Studio";
  return "history";
}

export function initSourceStatuses() {
  setSourceStatus("omlx", "checking", 0, "Checking oMLX model server.");
  setSourceStatus("lmstudio", "checking", 0, "Checking LM Studio model server.");
}

export function setSourceStatus(source, status, count, message) {
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

export function sourceStatusMessage(source, status, count) {
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

export function selectedSourceHealth() {
  return state.sourceHealth[state.selectedModelSource] ?? {
    status: "checking",
    count: 0,
    message: sourceStatusMessage(state.selectedModelSource, "checking", 0)
  };
}

export function prepareModelPlaceholder(source) {
  const health = state.sourceHealth[source] ?? { status: "checking", count: 0 };
  const label = modelSourceLabel(source);
  if (health.status === "offline") return label + " offline";
  if (health.status === "checking") return "Checking " + label + "...";
  if (health.status === "static") return label + " unavailable";
  if ((modelsForSource(source)).length === 0) return "No " + label + " models";
  return "Choose " + label + " model";
}

export function updatePrepareModelWarning() {
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


function modelsForSource(source) {
  return source === "lmstudio"
    ? state.lmStudioModels
    : state.omlxModels;
}
