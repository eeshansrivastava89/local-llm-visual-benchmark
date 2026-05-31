import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { PI_CONFIG, OPENCODE_CONFIG } from "./paths.mjs";
import { loadProfiles, readJsonIfExists, writeJson } from "./profiles.mjs";
import { backendFor } from "./backends.mjs";
import { colors } from "./ui.mjs";

// ── Provider config templates ────────────────────────────────────────────

const PROVIDER_TEMPLATES = {
  "llama-cpp": { name: "llama.cpp", apiKey: "none", api: "openai-completions", compat: { supportsDeveloperRole: false, supportsReasoningEffort: false } },
  "llama-cpp-mtp": { name: "llama.cpp MTP", apiKey: "none", api: "openai-completions", compat: { supportsDeveloperRole: false, supportsReasoningEffort: false } },
  "ollama": { name: "Ollama", apiKey: "ollama", api: "openai-completions", compat: { supportsDeveloperRole: true, supportsReasoningEffort: false } },
  "omlx": { name: "oMLX", apiKey: "none", api: "openai-completions", compat: { supportsDeveloperRole: false, supportsReasoningEffort: false } },
  "cloud": { name: "Cloud API", apiKey: "none", api: "openai-completions", compat: { supportsDeveloperRole: true, supportsReasoningEffort: true } }
};

// ── Pi config ────────────────────────────────────────────────────────────

export async function syncPiConfig(profile) {
  const profiles = await activeProviderProfiles(profile);
  const config = await readJsonIfExists(PI_CONFIG, { providers: {} });
  config.providers ??= {};
  config.providers[profile.providerId] = {
    baseUrl: profile.baseUrl,
    api: providerTemplate(profile.providerId).api,
    apiKey: providerTemplate(profile.providerId).apiKey,
    compat: providerTemplate(profile.providerId).compat,
    models: profiles.map(piModelConfig)
  };
  await writeJson(PI_CONFIG, config);
  console.log(colors.green(`Synced Pi config: ${PI_CONFIG} (${profiles.length} active ${profile.providerId} model${profiles.length === 1 ? "" : "s"})`));
}

// ── OpenCode config ───────────────────────────────────────────────────────

export async function syncOpenCodeConfig(profile) {
  const profiles = await activeProviderProfiles(profile);
  const config = await readJsonIfExists(OPENCODE_CONFIG, { provider: {} });
  config.provider ??= {};
  const template = providerTemplate(profile.providerId);
  const existing = config.provider[profile.providerId] ?? {};
  config.provider[profile.providerId] = {
    ...existing,
    name: template.name,
    npm: "@ai-sdk/openai-compatible",
    options: {
      ...(existing.options ?? {}),
      apiKey: template.apiKey,
      baseURL: profile.baseUrl
    },
    models: Object.fromEntries(profiles.map((item) => [item.modelAlias, openCodeModelConfig(item)]))
  };
  await writeJson(OPENCODE_CONFIG, config);
  console.log(colors.green(`Synced OpenCode config: ${OPENCODE_CONFIG} (${profiles.length} active ${profile.providerId} model${profiles.length === 1 ? "" : "s"})`));
}

// ── Removal ────────────────────────────────────────────────────────────────

export async function removeFromPiConfig(profile) {
  const config = await readJsonIfExists(PI_CONFIG, { providers: {} });
  config.providers ??= {};
  const provider = config.providers[profile.providerId];
  if (!provider?.models) return { cleaned: false, reason: `no ${profile.providerId} provider in Pi config` };
  const before = provider.models.length;
  provider.models = provider.models.filter((m) => m.id !== profile.modelAlias);
  if (provider.models.length === 0) {
    delete config.providers[profile.providerId];
  }
  if (before > provider.models.length) {
    await writeJson(PI_CONFIG, config);
    console.log(colors.green(`Removed ${profile.modelAlias} from Pi config`));
  }
  return { cleaned: before > provider.models.length, removed: before - provider.models.length };
}

export async function removeFromOpenCodeConfig(profile) {
  const config = await readJsonIfExists(OPENCODE_CONFIG, { provider: {} });
  config.provider ??= {};
  const provider = config.provider[profile.providerId];
  if (!provider?.models) return { cleaned: false, reason: `no ${profile.providerId} provider in OpenCode config` };
  if (!provider.models[profile.modelAlias]) return { cleaned: false, reason: `${profile.modelAlias} not in OpenCode config` };
  delete provider.models[profile.modelAlias];
  if (Object.keys(provider.models).length === 0) {
    delete config.provider[profile.providerId];
  }
  await writeJson(OPENCODE_CONFIG, config);
  console.log(colors.green(`Removed ${profile.modelAlias} from OpenCode config`));
  return { cleaned: true, removed: 1 };
}

// ── Status checks ──────────────────────────────────────────────────────────

export async function hasPiModel(profile) {
  const config = await readJsonIfExists(PI_CONFIG, null);
  return Boolean(config?.providers?.[profile.providerId]?.models?.some?.((model) => model.id === profile.modelAlias));
}

export async function hasOpenCodeModel(profile) {
  const config = await readJsonIfExists(OPENCODE_CONFIG, null);
  return Boolean(config?.provider?.[profile.providerId]?.models?.[profile.modelAlias]);
}

// ── Launch harness ──────────────────────────────────────────────────────────

export async function launchHarness(profile, harness) {
  if (harness === "pi") {
    console.log(colors.bold(`[pi] pi --model ${profile.harnesses.pi.model}`));
    await runForeground("pi", ["--model", profile.harnesses.pi.model]);
    return;
  }
  console.log(colors.bold(`[opencode] opencode --model ${profile.harnesses.opencode.model}`));
  await runForeground("opencode", ["--model", profile.harnesses.opencode.model]);
}

// ── Internals ───────────────────────────────────────────────────────────────

async function activeProviderProfiles(currentProfile) {
  const allProfiles = await loadProfiles().catch(() => []);
  const byAlias = new Map();
  for (const item of [...allProfiles, currentProfile]) {
    if (item.providerId !== currentProfile.providerId) continue;
    // For managed backends, all models are always available
    if (item.backend !== "llama-cpp" && item.backend !== "llama-cpp-mtp") {
      byAlias.set(item.modelAlias, item);
      continue;
    }
    // For local-server backends, only include profiles whose model files exist
    if (!item.modelPath || !existsSync(item.modelPath)) continue;
    byAlias.set(item.modelAlias, item);
  }
  return Array.from(byAlias.values()).sort((a, b) => a.modelAlias.localeCompare(b.modelAlias));
}

function providerTemplate(providerId) {
  return PROVIDER_TEMPLATES[providerId] ?? PROVIDER_TEMPLATES["llama-cpp"];
}

function modelInput(profile) {
  return profile.mmprojPath && existsSync(profile.mmprojPath) ? ["text", "image"] : ["text"];
}

function piModelConfig(profile) {
  const compat = modelCompat(profile);
  const reasoning = modelReasoning(profile);
  return {
    id: profile.modelAlias,
    name: profile.label,
    input: modelInput(profile),
    ...(reasoning === undefined ? {} : { reasoning }),
    ...(compat ? { compat } : {}),
    ...(profile.flags?.ctxSize ? { contextWindow: profile.flags.ctxSize } : {}),
    ...(profile.flags?.maxTokens ? { maxTokens: profile.flags.maxTokens } : {}),
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  };
}

function modelFamily(profile) {
  return [profile.id, profile.label, profile.modelAlias, profile.modelPath, profile.ollamaModel, profile.omlxModel].filter(Boolean).join(" ").toLowerCase();
}

function modelCompat(profile) {
  if (profile.compat) return profile.compat;
  const family = modelFamily(profile);
  if (family.includes("qwen") || family.includes("gemma-4") || family.includes("gemma 4")) {
    return { thinkingFormat: "qwen-chat-template" };
  }
  return null;
}

function modelReasoning(profile) {
  if (profile.reasoning !== undefined) return Boolean(profile.reasoning);
  const family = modelFamily(profile);
  if (family.includes("qwen") || family.includes("gemma-4") || family.includes("gemma 4")) return true;
  return undefined;
}

function openCodeModelConfig(profile) {
  const input = modelInput(profile);
  return {
    name: profile.label,
    modalities: {
      input,
      output: ["text"]
    },
    ...(input.includes("image") ? { attachment: true } : {}),
    ...(profile.flags?.ctxSize || profile.flags?.maxTokens
      ? {
          limit: {
            context: profile.flags?.ctxSize ?? 128000,
            output: profile.flags?.maxTokens ?? 32768
          }
        }
      : {})
  };
}

function runForeground(cmd, argv) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`)));
  });
}