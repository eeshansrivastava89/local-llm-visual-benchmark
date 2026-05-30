import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { ensureLocalDirs } from "./paths.mjs";
import { PRESETS } from "./presets.mjs";
import { scanGgufModels } from "./scan.mjs";
import { ensureProfileCommand, loadProfiles, profileExists, readProfile, saveProfile, profilePath, profileTimestamp, sanitizeProfileId, slugFromLabel, normalizeProfile, readState, deleteProfile } from "./profiles.mjs";
import { buildPrettyCommand } from "./command.mjs";
import { renderEstimate, renderEstimateExplanation } from "./estimate.mjs";
import { colors, createPrompt, formatBytes, printHelp, relativeTime, renderRows, startInteractive } from "./ui.mjs";
import { hasOpenCodeModel, hasPiModel, launchHarness, syncOpenCodeConfig, syncPiConfig, removeFromPiConfig, removeFromOpenCodeConfig } from "./harnesses.mjs";
import { isProfileRunning, profileRuntimeStatus, serverReady, startServer, stopProfile, waitForReady } from "./process.mjs";
import { tailFriendly } from "./logs.mjs";
import { backendFor, BACKENDS, backendChoices, inferBackendId } from "./backends.mjs";
import { SERVER_VARIANTS, serverBinaryFor } from "./server-variants.mjs";
import { prepareCommand } from "./prepare.mjs";

export async function runCli(argv) {
  const [command = "help", ...args] = argv;
  if (["help", "--help", "-h"].includes(command)) return printHelp();
  if (command === "list") return listCommand(args);
  if (command === "setup") return setupCommand(args);
  if (command === "show") return showCommand(args); // Backward-compatible alias; prefer: list <profile>
  if (command === "prepare" || command === "prep") return prepareCommand(args);
  if (command === "run") return runCommand(args);
  if (command === "stop") return stopCommand(args);
  if (command === "remove" || command === "rm") return removeCommand(args);
  throw new Error(`Unknown command: ${command}. Run scripts/local-llm.mjs help`);
}

async function listCommand(argv) {
  const what = argv[0];
  if (!what || what === "profiles") return listAll();
  if (what === "models") return listAll({ onlyModels: true }); // Hidden compatibility alias.
  return listProfile(what);
}

async function listProfile(id) {
  const profile = await ensureProfileCommand(await readProfile(id));
  console.log(await renderFullProfile(profile));
}

async function listAll(options = {}) {
  if (process.stdin.isTTY) startInteractive("local-llm list");
  await ensureLocalDirs();
  const profiles = await Promise.all((await loadProfiles()).map(async (profile) => {
    const backend = backendFor(profile.backend);
    return backend.needsCommandFile ? ensureProfileCommand(profile) : profile;
  }));
  const ggufModels = await scanGgufModels();
  const profiledModelPaths = new Set(profiles.map((profile) => profile.modelPath).filter(Boolean));
  const unprofiledGguf = ggufModels.filter((model) => !profiledModelPaths.has(model.path));
  const items = [];

  if (!options.onlyModels) {
    console.log(colors.bold("Saved profiles"));
    if (profiles.length === 0) {
      console.log(colors.yellow("  None yet. Download a model, then run: local-llm setup"));
    } else {
      for (const profile of profiles) {
        const index = items.push({ type: "profile", profile });
        const running = await isProfileRunning(profile);
        const timestamp = await profileTimestamp(profile.id);
        const backend = backendFor(profile.backend);
        const missing = backend.needsModelFile ? missingProfileFiles(profile) : "";
        const badge = backend.type === "managed-server" ? ` ${colors.magenta(`[${backend.label}]`)}` : "";
        console.log(`${String(index).padStart(2, " ")}. ${running ? colors.green("●") : colors.dim("○")} ${colors.bold(profile.label)}${badge} ${colors.dim(relativeTime(timestamp))}`);
        console.log(`    id: ${colors.cyan(profile.id)} · alias: ${colors.cyan(profile.modelAlias)} · ${profile.baseUrl}${missing ? ` · ${colors.red(missing)}` : ""}`);
      }
    }
    console.log("");
  }

  console.log(colors.bold(options.onlyModels ? `Downloaded GGUF models under ~/.lmstudio/models` : "Downloaded models not set up yet"));
  const visibleModels = options.onlyModels ? ggufModels : unprofiledGguf;
  if (visibleModels.length === 0) {
    console.log(options.onlyModels ? colors.yellow("  No GGUF models found.") : colors.dim("  None. Every downloaded GGUF has a profile."));
  } else {
    for (const model of visibleModels) {
      const index = items.push({ type: "model", model });
      console.log(`${String(index).padStart(2, " ")}. ${colors.cyan(model.label)} ${colors.dim(model.quant ?? "")}`);
      console.log(`    alias:  ${colors.cyan(model.aliasSuggestion)}`);
      console.log(`    model:  ${model.path}`);
      console.log(`    mmproj: ${model.mmprojPath ?? colors.dim("none found")}`);
      console.log(`    size:   ${formatBytes(model.sizeBytes)}`);
    }
  }

  // Managed backend models (Ollama, oMLX)
  const profiledAliases = new Set(profiles.map((p) => {
    if (p.backend === "ollama") return `ollama:${p.ollamaModel ?? p.modelAlias}`;
    if (p.backend === "omlx") return `omlx:${p.omlxModel ?? p.modelAlias}`;
    return null;
  }).filter(Boolean));
  for (const beId of ["ollama", "omlx"]) {
    const be = BACKENDS[beId];
    const models = await be.scanModels();
    if (models.length === 0) continue;
    const unprofiled = models.filter((m) => !profiledAliases.has(`${beId}:${m.id}`));
    console.log("");
    console.log(colors.bold(`${be.label} models`));
    if (unprofiled.length === 0) {
      console.log(colors.dim("  None without a profile."));
    } else {
      for (const model of unprofiled) {
        const index = items.push({ type: "managed", model, backendId: beId });
        console.log(`${String(index).padStart(2, " ")}. ${colors.cyan(model.label)} ${colors.magenta(`[${be.label}]`)}`);
        console.log(`    id: ${colors.cyan(model.id)}`);
      }
    }
  }

  if (process.stdin.isTTY && items.length > 0) {
    const prompt = createPrompt();
    try {
      const selected = await prompt.choice("Inspect", [
        ...items.map((item, index) => ({
          value: String(index),
          label: item.type === "profile" ? item.profile.label : item.model.label,
          hint: item.type === "profile" ? `${item.profile.id} · ${item.profile.modelAlias}` : item.type === "managed" ? `${BACKENDS[item.backendId].label} · id: ${item.model.id}` : `alias: ${item.model.aliasSuggestion}`
        })),
        { value: "__done", label: "Done" }
      ], "__done");
      if (selected === "__done") return;
      const item = items[Number(selected)];
      if (item.type === "profile") {
        const backend = backendFor(item.profile.backend);
        console.log("\n" + await renderFullProfile(backend.needsCommandFile ? await ensureProfileCommand(item.profile) : item.profile));
      } else if (item.type === "managed") {
        console.log("\n" + renderManagedModelDetails(item.model, BACKENDS[item.backendId]));
      } else {
        console.log("\n" + renderModelDetails(item.model));
      }
    } finally {
      prompt.close();
    }
  }
}

function renderModelDetails(model) {
  const suggestedId = slugFromLabel(model.label);
  const lines = [
    colors.bold(model.label),
    `Alias:  ${model.aliasSuggestion}`,
    `Model:  ${model.path}`,
    `MMProj: ${model.mmprojPath ?? "none"}`,
    `Size:   ${formatBytes(model.sizeBytes)}`,
    "",
    colors.bold("To create a runnable profile"),
    `local-llm setup ${suggestedId}`,
    "",
    colors.dim("After setup, this model will move into the Saved profiles section.")
  ];
  return lines.join("\n");
}

async function setupCommand(argv) {
  await ensureLocalDirs();
  const { positional, options } = parseOptions(argv);
  const requestedId = positional[0];
  if (requestedId && options.sync && profileExists(requestedId)) {
    const existing = await ensureProfileCommand(await readProfile(requestedId));
    await syncHarnessConfigs(existing, String(options.sync));
    return;
  }

  if (!process.stdin.isTTY) {
    throw new Error("Interactive setup requires a terminal. For config sync, use: scripts/local-llm.mjs setup <profile> --sync pi|opencode|both");
  }

  startInteractive("local-llm setup");
  const prompt = createPrompt();
  try {
    if (requestedId && profileExists(requestedId)) {
      const existing = await ensureProfileCommand(await readProfile(requestedId));
      console.log(renderProfileSummary(existing));
      console.log(colors.bold("Command file"));
      console.log(existing.commandPath);
      console.log(colors.dim("Existing profiles are edited by changing llama-server.sh directly. Setup will not rewrite launch flags."));
      const sync = await prompt.choice("Update harness configs?", syncChoices(), "both");
      await syncHarnessConfigs(existing, sync);
      return;
    }

    // ── Backend selection ─────────────────────────────────────────────────
    const backendId = await prompt.choice("Backend", backendChoices(), "llama-cpp");
    const backend = backendFor(backendId);

    if (backend.type === "managed-server") {
      // Ollama / oMLX: pick from running service models
      const managedModels = await backend.scanModels();
      if (managedModels.length === 0) {
        console.log(colors.yellow(`No models found from ${backend.label}. Is the service running?`));
        return;
      }
      const modelChoice = await prompt.choice(`${backend.label} model`, managedModels.map((m) => ({
        value: m.id,
        label: m.label,
        hint: [m.quant, m.family].filter(Boolean).join(" · ") || m.id
      })), managedModels[0].id);
      const model = managedModels.find((m) => m.id === modelChoice);
      if (!model) throw new Error(`Model disappeared: ${modelChoice}`);

      const existingById = profiles.find((p) => p.backend === backendId && (p.ollamaModel === model.id || p.omlxModel === model.id || p.modelAlias === model.id));
      if (existingById) {
        console.log(renderProfileSummary(existingById));
        console.log(colors.bold("Already set up"));
        const sync = await prompt.choice("Update harness configs?", syncChoices(), "both");
        await syncHarnessConfigs(existingById, sync);
        return;
      }

      const id = sanitizeProfileId(await prompt.text("Profile id", requestedId ?? slugFromLabel(model.label)));
      const modelAlias = await prompt.text("Model alias for Pi/OpenCode", model.id);
      const host = await prompt.text("Host", "127.0.0.1");
      const port = await prompt.number("Port", backend.defaultPort, 1, 65535);

      const profile = normalizeProfile({
        id,
        backend: backendId,
        label: model.label,
        providerId: backend.providerId,
        modelAlias,
        ollamaModel: backendId === "ollama" ? model.id : undefined,
        omlxModel: backendId === "omlx" ? model.id : undefined,
        flags: { host, port, ctxSize: 131072, temperature: 0.6, topP: 0.95, topK: 20, minP: 0, presencePenalty: 0, repeatPenalty: 1, parallel: 1, cacheTypeK: "bf16", cacheTypeV: "bf16", flashAttention: "on", jinja: true, batchSize: 512 },
        harnesses: {
          pi: { enabled: true, model: `${backend.providerId}/${modelAlias}` },
          opencode: { enabled: true, model: `${backend.providerId}/${modelAlias}` }
        }
      });

      console.log("\n" + renderProfileSummary(profile));
      if (!(await prompt.yesNo("Save profile", true))) return;
      await saveProfile(profile);
      const saved = await readProfile(id);
      console.log(colors.green(`Saved ${profilePath(id)}`));

      const sync = await prompt.choice("Update harness configs?", syncChoices(), "both");
      await syncHarnessConfigs(saved, sync);
      return;
    }

    // ── llama.cpp: GGUF model selection ─────────────────────────────────
    if (models.length === 0) throw new Error(`No GGUF models found under ~/.lmstudio/models.`);
    const profiles = await Promise.all((await loadProfiles()).map(async (profile) => {
      const be = backendFor(profile.backend);
      return be.needsCommandFile ? ensureProfileCommand(profile) : profile;
    }));
    const profileByModelPath = new Map(profiles.map((profile) => [profile.modelPath, profile]));
    const modelChoices = models.map((model) => {
      const profile = profileByModelPath.get(model.path);
      return {
        value: model.path,
        label: profile ? `${profile.label}  ✓ profiled` : model.label,
        hint: profile ? `${profile.id} · ${profile.modelAlias} · ${profile.baseUrl}` : `alias: ${model.aliasSuggestion} · ${formatBytes(model.sizeBytes)}${model.mmprojPath ? " · vision" : ""}`
      };
    });
    const unprofiled = models.find((model) => !profileByModelPath.has(model.path));
    const modelPath = await prompt.choice("Model", modelChoices, unprofiled?.path ?? models[0].path);
    const model = models.find((item) => item.path === modelPath);
    if (!model) throw new Error(`Selected model disappeared: ${modelPath}`);
    const existingForModel = profileByModelPath.get(model.path);
    if (existingForModel) {
      console.log(renderProfileSummary(existingForModel));
      console.log(colors.bold("Already set up"));
      console.log(`Profile: ${existingForModel.id}`);
      console.log(`Command: ${existingForModel.commandPath}`);
      const action = await prompt.choice("What next?", [
        { value: "sync", label: "Sync Pi/OpenCode", hint: "update harness config from llama-server.sh" },
        { value: "details", label: "Show details", hint: "inspect profile and command" },
        { value: "done", label: "Done", hint: "leave it unchanged" }
      ], "sync");
      if (action === "sync") {
        const sync = await prompt.choice("Sync", syncChoices(), "both");
        await syncHarnessConfigs(existingForModel, sync);
      } else if (action === "details") {
        console.log("\n" + await renderFullProfile(existingForModel));
      }
      return;
    }

    const serverVariantId = await prompt.choice("llama.cpp build", serverVariantChoices(), inferServerVariantId(model));
    const serverVariant = SERVER_VARIANTS[serverVariantId];
    if (serverVariantId !== "standard" && !existsSync(serverVariant.binary)) {
      console.log(colors.yellow(`MTP binary not found yet: ${serverVariant.binary}`));
      console.log(colors.dim("Setup can still save the profile, but run will fail until that build exists."));
    }

    const presetIds = Object.keys(PRESETS);
    const presetId = await prompt.choice("Preset", presetIds.map((id) => ({
      value: id,
      label: id,
      hint: PRESETS[id].label
    })), presetIds[0]);
    const defaults = { ...PRESETS[presetId].flags, ...serverVariant.flags };

    const id = sanitizeProfileId(await prompt.text("Profile id", requestedId ?? slugFromLabel(model.label)));
    const modelAlias = await prompt.text("Model alias for Pi/OpenCode", model.aliasSuggestion);
    console.log(colors.dim(`Host and port use ${serverVariant.label} defaults: ${defaults.host}:${defaults.port}. Edit llama-server.sh after setup if you need to change them.`));
    const ctxSize = await prompt.number("Context size - prompt window in tokens; larger means more memory", defaults.ctxSize, 1, 1048576);
    const cacheChoices = cacheTypeChoices();
    const cacheTypeK = await prompt.choice("K cache type - KV cache precision; bf16/f16 are stable, q8/q4 use less memory", cacheChoices, defaults.cacheTypeK);
    const cacheTypeV = await prompt.choice("V cache type - usually match K cache unless testing memory savings", cacheChoices, defaults.cacheTypeV);
    const temperature = await prompt.number("Temperature - randomness; Unsloth coding default is 0.6", defaults.temperature, 0, 5);
    const topP = await prompt.number("Top-p - nucleus sampling, 0..1; coding default 0.95", defaults.topP, 0, 1);
    const topK = await prompt.number("Top-k - candidate token cap; Unsloth recommends 20", defaults.topK, 0, 1000);
    const minP = await prompt.number("Min-p - filters low-prob tokens; Unsloth uses 0", defaults.minP, 0, 1);
    const presencePenalty = await prompt.number("Presence penalty - reduces repetition; coding default 0, general often 1.5", defaults.presencePenalty, -2, 2);
    const repeatPenalty = await prompt.number("Repeat penalty - 1 disables; keep 1 unless repetition is bad", defaults.repeatPenalty, 0, 2);

    const flags = { ...defaults, ctxSize, cacheTypeK, cacheTypeV, temperature, topP, topK, minP, presencePenalty, repeatPenalty };
    const profile = normalizeProfile({
      id,
      label: model.label,
      providerId: serverVariant.providerId,
      serverVariant: serverVariantId,
      modelAlias,
      modelPath: model.path,
      mmprojPath: model.mmprojPath,
      preset: presetId,
      flags,
      harnesses: {
        pi: { enabled: true, model: `${serverVariant.providerId}/${modelAlias}` },
        opencode: { enabled: true, model: `${serverVariant.providerId}/${modelAlias}` }
      }
    });

    console.log("\n" + renderEstimate(profile));
    console.log("\n" + colors.bold("Command"));
    console.log(buildPrettyCommand(profile));

    if (!(await prompt.yesNo("Save profile", true))) return;
    await saveProfile(profile);
    const saved = await readProfile(id);
    console.log(colors.green(`Saved ${profilePath(id)}`));
    console.log(colors.green(`Command file: ${saved.commandPath}`));

    const sync = await prompt.choice("Update harness configs?", syncChoices(), "none");
    await syncHarnessConfigs(saved, sync);
  } finally {
    prompt.close();
  }
}

async function showCommand(argv) {
  const profile = await ensureProfileCommand(await readProfileArg(argv));
  console.log(colors.yellow("`show` still works, but the simpler command is: local-llm list <profile>\n"));
  console.log(await renderFullProfile(profile));
}

async function runCommand(argv) {
  await ensureLocalDirs();
  const { positional, options } = parseOptions(argv);
  const { profile, withHarness } = positional.length > 0
    ? { profile: await ensureProfileCommand(await readProfileArg(positional)), withHarness: options.with }
    : await interactiveRunSelection(options);
  await runProfile(profile, { ...options, with: withHarness });
}

async function interactiveRunSelection(options) {
  if (!process.stdin.isTTY) throw new Error("Profile id is required when not running in an interactive terminal.");
  const profiles = await Promise.all((await loadProfiles()).map((profile) => ensureProfileCommand(profile)));
  if (profiles.length === 0) throw new Error("No profiles yet. Run: local-llm setup");
  startInteractive("local-llm run");

  const prompt = createPrompt();
  try {
    const profileId = await prompt.choice("Profile", await Promise.all(profiles.map(async (profile) => {
      const missing = missingProfileFiles(profile);
      return {
        value: profile.id,
        label: profile.label,
        hint: `${await isProfileRunning(profile) ? "running" : profile.id} · ${profile.modelAlias} · ${profile.baseUrl}${missing ? ` · ${missing}` : ""}`
      };
    })), profiles[0].id);
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) throw new Error(`Selected profile disappeared: ${profileId}`);
    const requestedHarness = options.with;
    if (requestedHarness && !["pi", "opencode"].includes(requestedHarness)) throw new Error("--with must be pi or opencode.");
    const withHarness = requestedHarness ?? await prompt.choice("Run mode", [
      { value: "pi", label: "Pi" },
      { value: "opencode", label: "OpenCode" },
      { value: "server", label: "Server only" }
    ], "pi");
    return { profile, withHarness: withHarness === "server" ? null : withHarness };
  } finally {
    prompt.close();
  }
}

async function runProfile(profile, options) {
  const withHarness = options.with;
  if (withHarness && !["pi", "opencode"].includes(withHarness)) throw new Error("--with must be pi or opencode.");
  if (withHarness === "pi" && !(await hasPiModel(profile))) throw new Error(`Pi config is missing ${profile.harnesses.pi.model}. Run setup and choose pi/both config sync.`);
  if (withHarness === "opencode" && !(await hasOpenCodeModel(profile))) throw new Error(`OpenCode config is missing ${profile.harnesses.opencode.model}. Run setup and choose opencode/both config sync.`);
  assertProfileFiles(profile);

  const backend = backendFor(profile.backend);
  const ready = await serverReady(profile.baseUrl);
  const isManaged = backend.type === "managed-server";

  if (isManaged) {
    if (!ready) throw new Error(`${backend.label} is not running at ${profile.baseUrl}. Start it and try again, or use --reuse-existing.`);
    console.log(colors.green(`[ready] ${backend.label} responding at ${profile.baseUrl}`));
    if (!withHarness) {
      console.log(colors.dim(`${backend.label} is a managed service — local-llm does not stop it.`));
      return;
    }
  } else {
    if (ready && !options["reuse-existing"]) throw new Error(`${profile.baseUrl}/models already responds. Rerun with --reuse-existing to use it explicitly.`);
  }

  const startedServer = !isManaged && !ready;
  let state = startedServer ? await startServer(profile) : (isManaged ? { baseUrl: profile.baseUrl, profileId: profile.id, managedBy: backend.id } : await readState(profile.id));
  if (!isManaged && ready) console.log(colors.yellow(`Reusing existing server at ${profile.baseUrl}`));

  const tail = !isManaged && state?.rawLogPath ? tailFriendly(state.rawLogPath, state.friendlyLogPath) : { stop() {} };
  try {
    if (!isManaged) {
      await waitForReady(profile, state?.pid, state?.rawLogPath);
      console.log(colors.green(`[ready] ${profile.baseUrl}/models responded`));
    }
    if (!withHarness) {
      if (!isManaged && state?.rawLogPath) console.log(colors.dim(`Raw log: ${state.rawLogPath}`));
      if (isManaged) {
        console.log(colors.dim(`${backend.label} is a managed service — local-llm does not stop it.`));
      } else {
        console.log(colors.dim(`Stop with: local-llm stop ${profile.id}`));
      }
      return;
    }
    tail.stop();
    try {
      await launchHarness(profile, withHarness);
    } finally {
      if (startedServer && !isManaged && !options["keep-server"]) {
        const result = await stopProfile(profile);
        console.log(result.stopped ? colors.green(`[stop] ${result.message}`) : colors.yellow(`[stop] ${result.message}`));
      } else if (!isManaged) {
        console.log(colors.dim(`Server is still running. Stop with: local-llm stop ${profile.id}`));
      }
    }
  } finally {
    tail.stop();
  }
}

async function stopCommand(argv) {
  await ensureLocalDirs();
  const { positional, options } = parseOptions(argv);
  if (options.all) return stopAllRunningProfiles();
  if (positional[0]) return stopOneProfile(positional[0]);
  return stopInteractive();
}

async function stopOneProfile(id) {
  const profile = await readProfile(id);
  const result = await stopProfile(profile);
  console.log(result.stopped ? colors.green(result.message) : colors.yellow(result.message));
}

async function stopAllRunningProfiles() {
  const running = await runningProfileStatuses();
  if (running.length === 0) {
    console.log(colors.dim("No tracked local-llm servers are running."));
    return;
  }
  for (const item of running) {
    const result = await stopProfile(item.profile);
    console.log(result.stopped ? colors.green(result.message) : colors.yellow(result.message));
  }
}

async function stopInteractive() {
  const statuses = await allProfileStatuses();
  const running = statuses.filter((item) => item.status.running);
  if (running.length === 0) {
    console.log(colors.dim("No tracked local-llm servers are running."));
    const responding = statuses.filter((item) => item.status.ready);
    if (responding.length > 0) {
      console.log(colors.yellow("Some configured endpoints respond, but local-llm has no tracked pid to stop:"));
      for (const item of responding) {
        console.log(`  ${item.profile.label} · ${item.profile.baseUrl}`);
      }
    }
    return;
  }

  if (process.stdin.isTTY) startInteractive("local-llm stop");
  console.log(colors.bold("Running local-llm servers"));
  printRuntimeList(running);

  if (!process.stdin.isTTY) {
    console.log(colors.dim("Stop one with: local-llm stop <profile-id>"));
    console.log(colors.dim("Stop all with: local-llm stop --all"));
    return;
  }

  const prompt = createPrompt();
  try {
    const choices = running.map(({ profile, status }) => ({
      value: profile.id,
      label: profile.label,
      hint: `pid ${status.pid} · ${formatBytes(status.rssBytes)} RSS · ${status.ready ? "ready" : "loading"}`
    }));
    if (running.length > 1) choices.unshift({ value: "__all", label: "Stop all running servers", hint: `${running.length} tracked processes` });
    choices.push({ value: "__cancel", label: "Cancel", hint: "leave servers running" });
    const selected = await prompt.choice("Stop", choices, choices[0].value);
    if (selected === "__cancel") return;
    const targets = selected === "__all" ? running : running.filter((item) => item.profile.id === selected);
    for (const item of targets) {
      const result = await stopProfile(item.profile);
      console.log(result.stopped ? colors.green(result.message) : colors.yellow(result.message));
    }
  } finally {
    prompt.close();
  }
}

async function removeCommand(argv) {
  await ensureLocalDirs();
  const { positional, options } = parseOptions(argv);
  if (positional[0]) return removeProfile(positional[0], options);
  return removeInteractive();
}

async function removeProfile(id, options) {
  if (!profileExists(id)) throw new Error(`Profile "${id}" not found.`);
  const profile = await readProfile(id);

  // Confirm unless --force
  if (!options.force && !options.yes) {
    if (!process.stdin.isTTY) {
      throw new Error("Confirmation required in non-interactive mode. Use --force to skip.");
    }
    const prompt = createPrompt();
    try {
      const confirmed = await prompt.yesNo(
        `Remove ${profile.label} (${profile.id}) and its harness configs?`,
        false
      );
      if (!confirmed) {
        console.log(colors.dim("Cancelled."));
        return;
      }
    } finally {
      prompt.close();
    }
  }

  // Stop server if running
  if (await isProfileRunning(profile)) {
    console.log(colors.yellow(`Stopping running server for ${profile.label}...`));
    await stopProfile(profile);
  }

  // Remove from Pi config
  const piResult = await removeFromPiConfig(profile);
  if (!piResult.cleaned && piResult.reason) {
    console.log(colors.dim(`Pi: ${piResult.reason}`));
  }

  // Remove from OpenCode config
  const ocResult = await removeFromOpenCodeConfig(profile);
  if (!ocResult.cleaned && ocResult.reason) {
    console.log(colors.dim(`OpenCode: ${ocResult.reason}`));
  }

  // Delete profile files
  const keepLogs = Boolean(options["keep-logs"]);
  const deleted = await deleteProfile(profile, { keepLogs });

  const parts = [];
  if (deleted.profileDir) parts.push("profile directory");
  if (deleted.legacyFile) parts.push("legacy file");
  if (deleted.state) parts.push("state");
  if (deleted.logs.length > 0) parts.push(`${deleted.logs.length} log file${deleted.logs.length === 1 ? "" : "s"}`);

  console.log(colors.green(`Removed ${profile.label} (${profile.id})`));
  if (parts.length > 0) console.log(colors.dim(`Deleted: ${parts.join(", ")}`));
  if (keepLogs) console.log(colors.dim("Logs preserved (--keep-logs)"));
}

async function removeInteractive() {
  const profiles = await loadProfiles();
  if (profiles.length === 0) {
    console.log(colors.dim("No profiles to remove."));
    return;
  }

  if (!process.stdin.isTTY) throw new Error("Profile id is required when not running in an interactive terminal.");
  startInteractive("local-llm remove");

  const prompt = createPrompt();
  try {
    const choices = await Promise.all(profiles.map(async (profile) => {
      const missing = missingProfileFiles(profile);
      const running = await isProfileRunning(profile);
      return {
        value: profile.id,
        label: profile.label,
        hint: `${running ? "running · " : ""}${profile.providerId}/${profile.modelAlias}${missing ? ` · ${missing}` : ""}`
      };
    }));
    choices.push({ value: "__cancel", label: "Cancel" });
    const selected = await prompt.choice("Remove profile", choices, "__cancel");
    if (selected === "__cancel") {
      console.log(colors.dim("Cancelled."));
      return;
    }
    await removeProfile(selected, {});
  } finally {
    prompt.close();
  }
}

async function allProfileStatuses() {
  const profiles = await loadProfiles();
  return Promise.all(profiles.map(async (profile) => ({ profile, status: await profileRuntimeStatus(profile) })));
}

async function runningProfileStatuses() {
  return (await allProfileStatuses()).filter((item) => item.status.running);
}

function printRuntimeList(items) {
  for (const { profile, status } of items) {
    const started = status.startedAt ? relativeTime(status.startedAt) : "unknown start";
    console.log(`  ${colors.green("●")} ${colors.bold(profile.label)}`);
    console.log(`    id: ${colors.cyan(profile.id)} · pid: ${status.pid} · RSS: ${colors.cyan(formatBytes(status.rssBytes))} · ${status.ready ? colors.green("ready") : colors.yellow("loading")}`);
    console.log(`    ${profile.baseUrl} · started ${started}`);
  }
}

async function syncHarnessConfigs(profile, sync) {
  if (!["none", "pi", "opencode", "both"].includes(sync)) {
    throw new Error("sync must be none, pi, opencode, or both.");
  }
  if (sync !== "none" && (!profile.modelPath || !existsSync(profile.modelPath))) {
    throw new Error(`Model file is missing, so config was not synced yet: ${profile.modelPath ?? "unknown"}`);
  }
  if (["pi", "both"].includes(sync)) await syncPiConfig(profile);
  if (["opencode", "both"].includes(sync)) await syncOpenCodeConfig(profile);
  if (sync === "none") console.log(colors.dim("No harness config changes made."));
}

async function renderFullProfile(profile) {
  const backend = backendFor(profile.backend);
  const isManaged = backend.type === "managed-server";
  const commandText = !isManaged && existsSync(profile.commandPath) ? await readFile(profile.commandPath, "utf8").catch(() => buildPrettyCommand(profile)) : null;
  const piConfigured = await hasPiModel(profile);
  const openCodeConfigured = await hasOpenCodeModel(profile);
  const missing = isManaged ? "" : missingProfileFiles(profile);
  const sections = [
    colors.bold(colors.cyan(profile.label)),
    "",
    renderSection("Profile", renderRows([
      ["ID", colors.cyan(profile.id)],
      ["Endpoint", colors.green(profile.baseUrl)],
      ["Backend", colors.magenta(backend.label)],
      ["Provider", colors.cyan(profile.providerId)],
      ...(!isManaged ? [
        ["Server", colors.dim(serverBinaryFor(profile))],
        ["Model", renderPathStatus(profile.modelPath, "missing --model")],
        ["MMProj", profile.mmprojPath ? renderPathStatus(profile.mmprojPath, "missing mmproj") : colors.yellow("none")]
      ] : [
        ...(backendId === "ollama" ? [["Ollama model", colors.cyan(profile.ollamaModel ?? profile.modelAlias)]] : []),
        ...(backendId === "omlx" ? [["oMLX model", colors.cyan(profile.omlxModel ?? profile.modelAlias)]] : [])
      ]),
      ["Alias", colors.cyan(profile.modelAlias)]
    ])),
    ""
  ];
  if (!isManaged && !missing) {
    sections.push(renderSection("Memory", renderEstimate(profile)));
    sections.push("");
    sections.push(renderSection("How estimate works", withoutFirstLine(renderEstimateExplanation(profile))));
    sections.push("");
  } else if (isManaged) {
    sections.push(renderSection("Memory", colors.dim(`${backend.label} manages its own memory. No local estimate needed.`)));
    sections.push("");
  }
  sections.push(renderSection("Harness", renderRows([
    ["Pi", `${configBadge(piConfigured)} ${colors.cyan(profile.harnesses.pi.model)}`],
    ["OpenCode", `${configBadge(openCodeConfigured)} ${colors.cyan(profile.harnesses.opencode.model)}`]
  ])));
  if (!isManaged && commandText) {
    sections.push("");
    sections.push(renderSection("Editable command file", colors.dim(profile.commandPath)));
    sections.push("");
    sections.push(renderSection("Command", highlightShell(commandText.trim())));
  }
  sections.push("");
  sections.push(renderSection("Next", [
    `${colors.green("Run:")}  local-llm run ${profile.id} --with pi`,
    ...(!isManaged ? [`${colors.cyan("Edit:")} ${profile.commandPath}`] : []),
    colors.dim(`Metadata: ${profilePath(profile.id)}`)
  ].join("\n")));
  return sections.join("\n");
}

function backendId(profile) {
  return profile.backend ?? (profile.serverVariant === "mtp" ? "llama-cpp-mtp" : "llama-cpp");
}

function renderProfileSummary(profile) {
  const backend = backendFor(profile.backend);
  const badge = backend.type === "managed-server" ? ` ${colors.magenta(`[${backend.label}]`)}` : "";
  return renderSection("Profile", renderRows([
    ["ID", colors.cyan(profile.id)],
    ["Label", colors.bold(profile.label) + badge],
    ["Endpoint", colors.green(profile.baseUrl)],
    ["Backend", colors.magenta(backend.label)],
    ["Provider", colors.cyan(profile.providerId)],
    ...(!backend.needsCommandFile ? [] : [
      ["Server", colors.dim(serverBinaryFor(profile))],
    ]),
    ["Alias", colors.cyan(profile.modelAlias)],
    ...(backend.needsModelFile ? [
      ["Model", renderPathStatus(profile.modelPath, "missing --model")],
      ["MMProj", profile.mmprojPath ? renderPathStatus(profile.mmprojPath, "missing mmproj") : colors.yellow("none")],
    ] : [
      ...(profile.backend === "ollama" ? [["Ollama model", colors.cyan(profile.ollamaModel ?? profile.modelAlias)]] : []),
      ...(profile.backend === "omlx" ? [["oMLX model", colors.cyan(profile.omlxModel ?? profile.modelAlias)]] : []),
    ])
  ]));
}

function assertProfileFiles(profile) {
  const backend = backendFor(profile.backend);
  if (backend.type === "managed-server") return; // No files to check for managed backends
  const missing = missingProfileFiles(profile);
  if (missing) throw new Error(`Cannot run ${profile.label}: ${missing}. Re-download it in LM Studio or edit ${profile.commandPath}.`);
}

function missingProfileFiles(profile) {
  const backend = backendFor(profile.backend);
  if (backend.type === "managed-server") return "";
  const missing = [];
  if (!profile.modelPath || !existsSync(profile.modelPath)) missing.push("model not in LM Studio");
  if (profile.mmprojPath && !existsSync(profile.mmprojPath)) missing.push("mmproj missing");
  return missing.join(", ");
}

function renderManagedModelDetails(model, backend) {
  const suggestedId = slugFromLabel(model.label);
  const lines = [
    colors.bold(model.label),
    `Id:     ${model.id}`,
    `Source: ${backend.label}`,
    model.quant ? `Quant:  ${model.quant}` : null,
    model.family ? `Family: ${model.family}` : null,
    model.sizeBytes ? `Size:   ${formatBytes(model.sizeBytes)}` : null,
    "",
    colors.bold("To create a runnable profile"),
    `local-llm setup ${suggestedId}`,
    "",
    colors.dim("After setup, this model will appear in the Saved profiles section.")
  ].filter(Boolean);
  return lines.join("\n");
}

function renderPathStatus(path, missingLabel) {
  if (!path) return colors.red(missingLabel);
  return existsSync(path) ? colors.dim(path) : `${colors.red(missingLabel)} ${colors.dim(path)}`;
}

function renderSection(title, body) {
  return `${colors.magenta("◆")} ${colors.bold(title)}\n${body}`;
}

function configBadge(configured) {
  return configured ? colors.green("configured") : colors.yellow("missing");
}

function withoutFirstLine(text) {
  return text.split("\n").slice(1).join("\n");
}

function highlightShell(text) {
  return text
    .split("\n")
    .map((line) => {
      if (/^\s*(#|$)/u.test(line)) return colors.dim(line);
      return line
        .replace(/\b(exec|llama-server)\b/gu, colors.green("$1"))
        .replace(/(--[A-Za-z0-9_-]+)/gu, colors.cyan("$1"))
        .replace(/('(?:[^']|'\\''|\\')*')/gu, colors.yellow("$1"));
    })
    .join("\n");
}

async function readProfileArg(argv) {
  const id = argv[0];
  if (!id) throw new Error("Profile id is required.");
  return readProfile(id);
}

function cacheTypeChoices() {
  return ["f32", "f16", "bf16", "q8_0", "q4_0", "q4_1", "iq4_nl", "q5_0", "q5_1"].map((value) => ({ value }));
}

function serverVariantChoices() {
  return backendChoices().filter((c) => c.value === "llama-cpp" || c.value === "llama-cpp-mtp");
}

function syncChoices() {
  return [
    { value: "both", label: "Pi and OpenCode" },
    { value: "pi", label: "Pi only" },
    { value: "opencode", label: "OpenCode only" },
    { value: "none", label: "None" }
  ];
}

function parseOptions(argv) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (item.startsWith("--")) {
      const key = item.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        options[key] = next;
        i += 1;
      } else {
        options[key] = true;
      }
    } else {
      positional.push(item);
    }
  }
  return { positional, options };
}
