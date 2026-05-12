import { els } from "./dom.js";
import { state } from "./state.js";
import { fetchJson, postJson } from "./api.js";
import { setButtonLabel } from "./icons.js";
import {
  setSourceStatus,
  sourceStatusMessage,
  updateConfigPresence,
  updateLmStepStates,
  updateSyncButtons,
  renderModelInventory
} from "./setup-ui.js";
import { updateOnboarding } from "./ui.js";
import { renderModelSources } from "./workbench-controller.js";
import { renderPrepOptions } from "./prepare-controller.js";
import { updateWriteControls } from "./operational-controls.js";

let omlxModelsRequestId = 0;

export async function syncModels(targets) {
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

export async function loadConnection(options = {}) {
  setSourceStatus("lmstudio", "checking", state.lmStudioModels.length, "Checking LM Studio model server.");
  if (options.manual) {
    els.refreshConnection.disabled = true;
    setButtonLabel(els.refreshConnection, "Refreshing…", "refresh-cw");
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
      setButtonLabel(els.refreshConnection, "Refresh", "refresh-cw");
    }
  }
}

export async function loadOmlxModels(options = {}) {
  const requestId = ++omlxModelsRequestId;
  setSourceStatus("omlx", "checking", state.omlxModels.length, "Checking oMLX model server.");
  if (options.manual) {
    els.refreshOmlx.disabled = true;
    setButtonLabel(els.refreshOmlx, "Refreshing…", "refresh-cw");
    els.omlxConnectionMessage.textContent = "Checking oMLX and refreshing models…";
  }

  try {
    const data = await fetchJson("/api/omlx/models?baseUrl=" + encodeURIComponent(els.omlxBaseUrl.value));
    if (requestId !== omlxModelsRequestId) {
      return state.omlxModels.length;
    }
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
    if (requestId !== omlxModelsRequestId) {
      return state.omlxModels.length;
    }
    state.omlxConnected = false;
    state.omlxModels = [];
    setSourceStatus("omlx", "offline", 0, "oMLX is not reachable. Start the oMLX server, then refresh. " + error.message);
    updateDiscoveredModels();
    renderModelSources();
    renderPrepOptions();
    els.omlxConnectionMessage.textContent = "oMLX unavailable: " + error.message;
    return 0;
  } finally {
    if (requestId === omlxModelsRequestId && options.manual) {
      els.refreshOmlx.disabled = false;
      setButtonLabel(els.refreshOmlx, "Refresh", "refresh-cw");
    }
  }
}

export async function loadModels() {
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

export async function loadModelSyncState() {
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

export function setConnectionMessage(message) {
  els.connectionMessage.textContent = message;
}
