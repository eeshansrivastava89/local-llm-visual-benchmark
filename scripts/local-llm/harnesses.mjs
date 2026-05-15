import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { PI_CONFIG, OPENCODE_CONFIG } from "./paths.mjs";
import { loadProfiles, readJsonIfExists, writeJson } from "./profiles.mjs";
import { colors } from "./ui.mjs";

export async function syncPiConfig(profile) {
  const profiles = await activeProviderProfiles(profile);
  const config = await readJsonIfExists(PI_CONFIG, { providers: {} });
  config.providers ??= {};
  config.providers[profile.providerId] = {
    baseUrl: profile.baseUrl,
    api: "openai-completions",
    apiKey: "none",
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false
    },
    models: profiles.map(piModelConfig)
  };
  await writeJson(PI_CONFIG, config);
  console.log(colors.green(`Synced Pi config: ${PI_CONFIG} (${profiles.length} active ${profile.providerId} model${profiles.length === 1 ? "" : "s"})`));
}

export async function syncOpenCodeConfig(profile) {
  const profiles = await activeProviderProfiles(profile);
  const config = await readJsonIfExists(OPENCODE_CONFIG, { provider: {} });
  config.provider ??= {};
  const existing = config.provider[profile.providerId] ?? {};
  config.provider[profile.providerId] = {
    ...existing,
    name: "llama.cpp",
    npm: "@ai-sdk/openai-compatible",
    options: {
      ...(existing.options ?? {}),
      apiKey: "none",
      baseURL: profile.baseUrl
    },
    models: Object.fromEntries(profiles.map((item) => [item.modelAlias, openCodeModelConfig(item)]))
  };
  await writeJson(OPENCODE_CONFIG, config);
  console.log(colors.green(`Synced OpenCode config: ${OPENCODE_CONFIG} (${profiles.length} active ${profile.providerId} model${profiles.length === 1 ? "" : "s"})`));
}

async function activeProviderProfiles(currentProfile) {
  const allProfiles = await loadProfiles().catch(() => []);
  const byAlias = new Map();
  for (const item of [...allProfiles, currentProfile]) {
    if (item.providerId !== currentProfile.providerId) continue;
    if (!item.modelPath || !existsSync(item.modelPath)) continue;
    byAlias.set(item.modelAlias, item);
  }
  return Array.from(byAlias.values()).sort((a, b) => a.modelAlias.localeCompare(b.modelAlias));
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
  return [profile.id, profile.label, profile.modelAlias, profile.modelPath].filter(Boolean).join(" ").toLowerCase();
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
  return {
    name: profile.label,
    modalities: {
      input: modelInput(profile),
      output: ["text"]
    },
    ...(profile.flags?.ctxSize || profile.flags?.maxTokens
      ? {
          limit: {
            ...(profile.flags?.ctxSize ? { context: profile.flags.ctxSize } : {}),
            ...(profile.flags?.maxTokens ? { output: profile.flags.maxTokens } : {})
          }
        }
      : {})
  };
}

export async function hasPiModel(profile) {
  const config = await readJsonIfExists(PI_CONFIG, null);
  return Boolean(config?.providers?.[profile.providerId]?.models?.some?.((model) => model.id === profile.modelAlias));
}

export async function hasOpenCodeModel(profile) {
  const config = await readJsonIfExists(OPENCODE_CONFIG, null);
  return Boolean(config?.provider?.[profile.providerId]?.models?.[profile.modelAlias]);
}

export async function launchHarness(profile, harness) {
  if (harness === "pi") {
    console.log(colors.bold(`[pi] pi --model ${profile.harnesses.pi.model}`));
    await runForeground("pi", ["--model", profile.harnesses.pi.model]);
    return;
  }
  console.log(colors.bold(`[opencode] opencode --model ${profile.harnesses.opencode.model}`));
  await runForeground("opencode", ["--model", profile.harnesses.opencode.model]);
}

function runForeground(cmd, argv) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`)));
  });
}
