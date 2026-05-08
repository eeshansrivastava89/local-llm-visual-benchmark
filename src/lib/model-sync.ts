import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { normalizeLmStudioBaseUrl } from "./lmstudio";

export type ModelSyncTarget = "opencode" | "pi";

export interface ModelSyncState {
  enabled: boolean;
  paths: {
    opencode: string;
    pi: string;
  };
  files: {
    opencode: {
      exists: boolean;
      modelIds: string[];
    };
    pi: {
      exists: boolean;
      modelIds: string[];
    };
  };
}

export interface MirrorModelsRequest {
  baseUrl?: string;
  modelIds: string[];
  targets: ModelSyncTarget[];
}

export interface MirrorModelsResult {
  updated: ModelSyncTarget[];
  mirroredModelCount: number;
  state: ModelSyncState;
}

const OPEN_CODE_PROVIDER_PACKAGE = "@ai-sdk/openai-compatible";
const OPEN_CODE_PROVIDER_NAME = "LM Studio";
const OPEN_CODE_PROVIDER_ID = "lmstudio";
const DEFAULT_LMSTUDIO_API_KEY = "lm-studio";

function homePath(...segments: string[]): string {
  return join(process.env.HOME ?? homedir(), ...segments);
}

function defaultOpenCodePath(): string {
  return homePath(".config", "opencode", "opencode.json");
}

function defaultPiPath(): string {
  return homePath(".pi", "agent", "models.json");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortedUniqueModelIds(modelIds: string[]): string[] {
  return Array.from(
    new Set(
      modelIds
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));
}

async function readJsonFile(filePath: string): Promise<{
  exists: boolean;
  value: Record<string, unknown>;
}> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!isObject(parsed)) {
      throw new Error("Expected a JSON object at the root.");
    }
    return {
      exists: true,
      value: parsed
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return {
        exists: false,
        value: {}
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read ${filePath}: ${message}`);
  }
}

async function writeJsonFile(
  filePath: string,
  value: Record<string, unknown>
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function ensureObjectField(
  container: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  const existing = container[key];
  if (isObject(existing)) {
    return existing;
  }
  const next: Record<string, unknown> = {};
  container[key] = next;
  return next;
}

function opencodeModelIds(config: Record<string, unknown>): string[] {
  const provider = isObject(config.provider) ? config.provider : {};
  const lmstudio = isObject(provider[OPEN_CODE_PROVIDER_ID])
    ? provider[OPEN_CODE_PROVIDER_ID]
    : {};
  const models = isObject(lmstudio.models) ? lmstudio.models : {};
  return Object.keys(models).sort((a, b) => a.localeCompare(b));
}

function piModelIds(config: Record<string, unknown>): string[] {
  const providers = isObject(config.providers) ? config.providers : {};
  const lmstudio = isObject(providers.lmstudio) ? providers.lmstudio : {};
  const models = Array.isArray(lmstudio.models) ? lmstudio.models : [];
  return models
    .flatMap((entry) => {
      if (!isObject(entry) || typeof entry.id !== "string") {
        return [];
      }
      const id = entry.id.trim();
      return id.length > 0 ? [id] : [];
    })
    .sort((a, b) => a.localeCompare(b));
}

function mirrorOpenCodeModels(
  config: Record<string, unknown>,
  modelIds: string[],
  baseUrl: string
): void {
  const provider = ensureObjectField(config, "provider");
  const lmstudio = ensureObjectField(provider, OPEN_CODE_PROVIDER_ID);
  lmstudio.name = typeof lmstudio.name === "string" ? lmstudio.name : OPEN_CODE_PROVIDER_NAME;
  lmstudio.npm = typeof lmstudio.npm === "string" ? lmstudio.npm : OPEN_CODE_PROVIDER_PACKAGE;
  const options = ensureObjectField(lmstudio, "options");
  options.apiKey = typeof options.apiKey === "string" ? options.apiKey : DEFAULT_LMSTUDIO_API_KEY;
  options.baseURL = baseUrl;

  const existingModels = isObject(lmstudio.models) ? lmstudio.models : {};
  const nextModels: Record<string, unknown> = {};
  for (const modelId of modelIds) {
    const existing = existingModels[modelId];
    if (isObject(existing)) {
      nextModels[modelId] = {
        ...existing,
        name: typeof existing.name === "string" ? existing.name : modelId
      };
    } else {
      nextModels[modelId] = {
        name: modelId
      };
    }
  }
  lmstudio.models = nextModels;
}

function mirrorPiModels(
  config: Record<string, unknown>,
  modelIds: string[],
  baseUrl: string
): void {
  const providers = ensureObjectField(config, "providers");
  const lmstudio = ensureObjectField(providers, "lmstudio");
  lmstudio.baseUrl = baseUrl;
  lmstudio.api = typeof lmstudio.api === "string" ? lmstudio.api : "openai-completions";
  lmstudio.apiKey =
    typeof lmstudio.apiKey === "string" ? lmstudio.apiKey : DEFAULT_LMSTUDIO_API_KEY;

  const compat = ensureObjectField(lmstudio, "compat");
  if (typeof compat.supportsDeveloperRole !== "boolean") {
    compat.supportsDeveloperRole = false;
  }
  if (typeof compat.supportsReasoningEffort !== "boolean") {
    compat.supportsReasoningEffort = false;
  }

  const existingArray = Array.isArray(lmstudio.models) ? lmstudio.models : [];
  const existingById = new Map<string, Record<string, unknown>>();
  for (const entry of existingArray) {
    if (isObject(entry) && typeof entry.id === "string" && entry.id.trim().length > 0) {
      existingById.set(entry.id.trim(), entry);
    }
  }

  lmstudio.models = modelIds.map((modelId) => {
    const existing = existingById.get(modelId);
    if (existing) {
      return {
        ...existing,
        id: modelId,
        name: typeof existing.name === "string" ? existing.name : modelId
      };
    }
    return {
      id: modelId,
      name: modelId,
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 262144,
      maxTokens: 32768
    };
  });
}

export async function getModelSyncState(options: {
  enabled: boolean;
  opencodePath?: string;
  piPath?: string;
}): Promise<ModelSyncState> {
  const opencodePath = options.opencodePath ?? defaultOpenCodePath();
  const piPath = options.piPath ?? defaultPiPath();

  const [opencode, pi] = await Promise.all([
    readJsonFile(opencodePath),
    readJsonFile(piPath)
  ]);

  return {
    enabled: options.enabled,
    paths: {
      opencode: opencodePath,
      pi: piPath
    },
    files: {
      opencode: {
        exists: opencode.exists,
        modelIds: opencodeModelIds(opencode.value)
      },
      pi: {
        exists: pi.exists,
        modelIds: piModelIds(pi.value)
      }
    }
  };
}

export async function mirrorModelsToConfigs(
  request: MirrorModelsRequest,
  options: {
    enabled: boolean;
    opencodePath?: string;
    piPath?: string;
  }
): Promise<MirrorModelsResult> {
  if (!options.enabled) {
    throw new Error("Mirror mode is only available in dev server mode.");
  }

  const modelIds = sortedUniqueModelIds(request.modelIds);
  if (modelIds.length === 0) {
    throw new Error("No model IDs were provided for mirror mode.");
  }

  const targets = Array.from(new Set(request.targets));
  if (targets.length === 0) {
    throw new Error("Mirror mode requires at least one target.");
  }

  const baseUrl = normalizeLmStudioBaseUrl(request.baseUrl);
  const opencodePath = options.opencodePath ?? defaultOpenCodePath();
  const piPath = options.piPath ?? defaultPiPath();

  if (targets.includes("opencode")) {
    const file = await readJsonFile(opencodePath);
    mirrorOpenCodeModels(file.value, modelIds, baseUrl);
    await writeJsonFile(opencodePath, file.value);
  }

  if (targets.includes("pi")) {
    const file = await readJsonFile(piPath);
    mirrorPiModels(file.value, modelIds, baseUrl);
    await writeJsonFile(piPath, file.value);
  }

  const state = await getModelSyncState({
    enabled: options.enabled,
    opencodePath,
    piPath
  });

  return {
    updated: targets,
    mirroredModelCount: modelIds.length,
    state
  };
}
