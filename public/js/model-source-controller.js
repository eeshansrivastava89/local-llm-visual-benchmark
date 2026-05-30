import { state } from "./state.js";
import { fetchJson } from "./api.js";
import { updateWriteControls } from "./operational-controls.js";

let omlxModelsRequestId = 0;

export async function loadConnection() {
  try {
    const status = await fetchJson("/api/status");
    if (typeof status.app?.writesEnabled === "boolean") {
      state.writesEnabled = status.app.writesEnabled;
      updateWriteControls();
    }
    const connection = status.lmStudio?.connection;
    if (connection?.ok) {
      state.lmConnected = true;
      await loadModels();
    } else {
      state.lmConnected = false;
      state.lmStudioModels = [];
    }
  } catch {
    state.lmConnected = false;
    state.lmStudioModels = [];
  }
}

export async function loadOmlxModels() {
  const requestId = ++omlxModelsRequestId;
  try {
    const data = await fetchJson("/api/omlx/models");
    if (requestId !== omlxModelsRequestId) return;
    const discovered = (data.models ?? []).map((model) => ({ ...model, source: "omlx" }));
    state.omlxConnected = true;
    state.omlxModels = discovered;
    updateDiscoveredModels();
    return discovered.length;
  } catch {
    if (requestId !== omlxModelsRequestId) return;
    state.omlxConnected = false;
    state.omlxModels = [];
    updateDiscoveredModels();
    return 0;
  }
}

export async function loadModels() {
  try {
    const data = await fetchJson("/api/lmstudio/models");
    const discovered = (data.models ?? []).map((model) => ({ ...model, source: "lmstudio" }));
    state.lmStudioModels = discovered;
    updateDiscoveredModels();
    return discovered.length;
  } catch {
    state.lmConnected = false;
    state.lmStudioModels = [];
    updateDiscoveredModels();
    return 0;
  }
}

function updateDiscoveredModels() {
  state.discoveredModels = [...state.omlxModels, ...state.lmStudioModels];
}

export async function loadModelSyncState() {
  if (state.staticMode) {
    state.modelSync.enabled = false;
    return;
  }
  try {
    const data = await fetchJson("/api/model-sync");
    state.modelSync = data.sync ?? state.modelSync;
  } catch {
    state.modelSync.enabled = false;
  }
}