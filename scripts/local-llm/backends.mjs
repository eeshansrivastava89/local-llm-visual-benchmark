import { LMSTUDIO_MODELS_DIR } from "./paths.mjs";
import { scanGgufModels } from "./scan.mjs";

const LLAMA_SERVER_BINARY = "/Users/eeshans/dev/llama.cpp-mtp/build/bin/llama-server";

export const BACKENDS = {
  "llama-cpp": {
    id: "llama-cpp",
    label: "llama.cpp",
    type: "local-server",
    providerId: "llama-cpp",
    defaultPort: 8080,
    defaultBaseUrl: "http://127.0.0.1:8080/v1",
    binary: LLAMA_SERVER_BINARY,
    extraArgs: [],
    needsCommandFile: true,
    needsModelFile: true,
    scanModels: () => scanGgufModels()
  },
  "llama-cpp-mtp": {
    id: "llama-cpp-mtp",
    label: "llama.cpp MTP",
    type: "local-server",
    providerId: "llama-cpp-mtp",
    defaultPort: 8081,
    defaultBaseUrl: "http://127.0.0.1:8081/v1",
    binary: LLAMA_SERVER_BINARY,
    extraArgs: ["--spec-type", "draft-mtp", "--spec-draft-n-max", "2"],
    needsCommandFile: true,
    needsModelFile: true,
    scanModels: () => scanGgufModels()
  },
  "ollama": {
    id: "ollama",
    label: "Ollama",
    type: "managed-server",
    providerId: "ollama",
    defaultPort: 11434,
    defaultBaseUrl: "http://localhost:11434/v1",
    binary: null,
    extraArgs: [],
    needsCommandFile: false,
    needsModelFile: false,
    scanModels: () => scanOllamaModels()
  },
  "omlx": {
    id: "omlx",
    label: "oMLX",
    type: "managed-server",
    providerId: "omlx",
    defaultPort: 8000,
    defaultBaseUrl: "http://127.0.0.1:8000/v1",
    binary: null,
    extraArgs: [],
    needsCommandFile: false,
    needsModelFile: false,
    scanModels: () => scanOmlxModels()
  }
};

export function backendFor(backendId) {
  const backend = BACKENDS[backendId ?? "llama-cpp"];
  if (!backend) throw new Error(`Unknown backend: ${backendId}`);
  return backend;
}

export function inferBackendId(modelOrProfile) {
  const haystack = [
    modelOrProfile?.path,
    modelOrProfile?.modelPath,
    modelOrProfile?.label,
    modelOrProfile?.modelAlias,
    modelOrProfile?.id,
    modelOrProfile?.providerId,
    modelOrProfile?.backend
  ].filter(Boolean).join(" ").toLowerCase();
  if (haystack.includes("mtp")) return "llama-cpp-mtp";
  return "llama-cpp";
}

export function backendChoices() {
  return Object.values(BACKENDS).map((b) => ({
    value: b.id,
    label: b.label,
    hint: b.type === "local-server" ? "manages llama-server process" : "connects to running service"
  }));
}

// ── Ollama model discovery ──────────────────────────────────────────────

async function scanOllamaModels() {
  try {
    const response = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return [];
    const body = await response.json();
    if (!Array.isArray(body?.models)) return [];
    return body.models.map((model) => ({
      id: model.name,
      label: ollamaLabel(model.name),
      aliasSuggestion: model.name,
      sizeBytes: model.size ?? 0,
      quant: model.details?.quantization_level,
      family: model.details?.family,
      backend: "ollama",
      source: "ollama"
    })).sort((a, b) => a.label.localeCompare(b.label));
  } catch {
    return [];
  }
}

// ── oMLX model discovery ───────────────────────────────────────────────

async function scanOmlxModels() {
  try {
    const response = await fetch("http://127.0.0.1:8000/v1/models", { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return [];
    const body = await response.json();
    if (!Array.isArray(body?.data)) return [];
    return body.data.map((model) => ({
      id: model.id,
      label: omlxLabel(model.id),
      aliasSuggestion: model.id,
      sizeBytes: 0,
      quant: null,
      family: null,
      backend: "omlx",
      source: "omlx"
    })).sort((a, b) => a.label.localeCompare(b.label));
  } catch {
    return [];
  }
}

// ── Labels ──────────────────────────────────────────────────────────────

function ollamaLabel(name) {
  return name.replace(/[-_]/gu, " ").replace(/^gemma\b/iu, "Gemma").replace(/^qwen/iu, "Qwen");
}

function omlxLabel(id) {
  return id.replace(/[-_]/gu, " ").replace(/^gemma-4/iu, "Gemma 4").replace(/^qwen/iu, "Qwen");
}