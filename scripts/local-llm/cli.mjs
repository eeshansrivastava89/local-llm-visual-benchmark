import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { LMSTUDIO_MODELS_DIR } from "./paths.mjs";
import { ensureLocalDirs } from "./paths.mjs";
import { PRESETS } from "./presets.mjs";
import { scanModels } from "./scan.mjs";
import { ensureProfileCommand, loadProfiles, profileExists, readProfile, saveProfile, profilePath, profileTimestamp, sanitizeProfileId, slugFromLabel, normalizeProfile, readState } from "./profiles.mjs";
import { buildPrettyCommand } from "./command.mjs";
import { renderEstimate, renderEstimateExplanation } from "./estimate.mjs";
import { colors, createPrompt, formatBytes, printHelp, relativeTime, renderRows, startInteractive } from "./ui.mjs";
import { hasOpenCodeModel, hasPiModel, launchHarness, syncOpenCodeConfig, syncPiConfig } from "./harnesses.mjs";
import { isProfileRunning, serverReady, startServer, stopProfile, waitForReady } from "./process.mjs";
import { tailFriendly } from "./logs.mjs";

export async function runCli(argv) {
  const [command = "help", ...args] = argv;
  if (["help", "--help", "-h"].includes(command)) return printHelp();
  if (command === "list") return listCommand(args);
  if (command === "setup") return setupCommand(args);
  if (command === "show") return showCommand(args); // Backward-compatible alias; prefer: list <profile>
  if (command === "run") return runCommand(args);
  if (command === "stop") return stopCommand(args);
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
  const profiles = await Promise.all((await loadProfiles()).map((profile) => ensureProfileCommand(profile)));
  const models = await scanModels();
  const profiledModelPaths = new Set(profiles.map((profile) => profile.modelPath).filter(Boolean));
  const unprofiledModels = models.filter((model) => !profiledModelPaths.has(model.path));
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
        console.log(`${String(index).padStart(2, " ")}. ${running ? colors.green("●") : colors.dim("○")} ${colors.cyan(profile.id)} ${profile.label} ${colors.dim(relativeTime(timestamp))}`);
        console.log(`    ${profile.baseUrl} · ${profile.modelAlias}`);
      }
    }
    console.log("");
  }

  console.log(colors.bold(options.onlyModels ? `Downloaded GGUF models under ${LMSTUDIO_MODELS_DIR}` : "Downloaded models not set up yet"));
  const visibleModels = options.onlyModels ? models : unprofiledModels;
  if (visibleModels.length === 0) {
    console.log(options.onlyModels ? colors.yellow("  No GGUF models found.") : colors.dim("  None. Every downloaded GGUF has a profile."));
  } else {
    for (const model of visibleModels) {
      const index = items.push({ type: "model", model });
      console.log(`${String(index).padStart(2, " ")}. ${colors.cyan(model.label)} ${colors.dim(model.quant ?? "")}`);
      console.log(`    model:  ${model.path}`);
      console.log(`    mmproj: ${model.mmprojPath ?? colors.dim("none found")}`);
      console.log(`    size:   ${formatBytes(model.sizeBytes)}`);
    }
  }

  if (process.stdin.isTTY && items.length > 0) {
    const prompt = createPrompt();
    try {
      const selected = await prompt.choice("Inspect", [
        ...items.map((item, index) => ({
          value: String(index),
          label: item.type === "profile" ? item.profile.id : item.model.label,
          hint: item.type === "profile" ? item.profile.modelAlias : "needs setup"
        })),
        { value: "__done", label: "Done" }
      ], "__done");
      if (selected === "__done") return;
      const item = items[Number(selected)];
      if (item.type === "profile") {
        console.log("\n" + await renderFullProfile(await ensureProfileCommand(item.profile)));
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

    const models = await scanModels();
    if (models.length === 0) throw new Error(`No GGUF models found under ${LMSTUDIO_MODELS_DIR}.`);
    const profiles = await Promise.all((await loadProfiles()).map((profile) => ensureProfileCommand(profile)));
    const profileByModelPath = new Map(profiles.map((profile) => [profile.modelPath, profile]));
    const modelChoices = models.map((model) => {
      const profile = profileByModelPath.get(model.path);
      return {
        value: model.path,
        label: profile ? `${model.label}  ✓ profiled as ${profile.id}` : model.label,
        hint: profile ? `${profile.baseUrl} · ${profile.modelAlias}` : `${formatBytes(model.sizeBytes)}${model.mmprojPath ? " · vision" : ""}`
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

    const presetIds = Object.keys(PRESETS);
    const presetId = await prompt.choice("Preset", presetIds.map((id) => ({
      value: id,
      label: id,
      hint: PRESETS[id].label
    })), presetIds[0]);
    const defaults = PRESETS[presetId].flags;

    const id = sanitizeProfileId(await prompt.text("Profile id", requestedId ?? slugFromLabel(model.label)));
    const modelAlias = await prompt.text("Model alias for Pi/OpenCode", model.aliasSuggestion);
    console.log(colors.dim(`Host and port use preset defaults: ${defaults.host}:${defaults.port}. Edit llama-server.sh after setup if you need to change them.`));
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
      providerId: "llama-cpp",
      modelAlias,
      modelPath: model.path,
      mmprojPath: model.mmprojPath,
      preset: presetId,
      flags,
      harnesses: {
        pi: { enabled: true, model: `llama-cpp/${modelAlias}` },
        opencode: { enabled: true, model: `llama-cpp/${modelAlias}` }
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
    const profileId = await prompt.choice("Profile", await Promise.all(profiles.map(async (profile) => ({
      value: profile.id,
      label: profile.id,
      hint: `${await isProfileRunning(profile) ? "running" : profile.label} · ${profile.baseUrl}`
    }))), profiles[0].id);
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

  const ready = await serverReady(profile.baseUrl);
  if (ready && !options["reuse-existing"]) throw new Error(`${profile.baseUrl}/models already responds. Rerun with --reuse-existing to use it explicitly.`);

  const startedServer = !ready;
  let state = await readState(profile.id);
  if (startedServer) state = await startServer(profile);
  else console.log(colors.yellow(`Reusing existing server at ${profile.baseUrl}`));

  const tail = state?.rawLogPath ? tailFriendly(state.rawLogPath, state.friendlyLogPath) : { stop() {} };
  try {
    await waitForReady(profile, state?.pid, state?.rawLogPath);
    console.log(colors.green(`[ready] ${profile.baseUrl}/models responded`));
    if (!withHarness) {
      if (state?.rawLogPath) console.log(colors.dim(`Raw log: ${state.rawLogPath}`));
      console.log(colors.dim(`Stop with: local-llm stop ${profile.id}`));
      return;
    }
    try {
      await launchHarness(profile, withHarness);
    } finally {
      if (startedServer && !options["keep-server"]) {
        const result = await stopProfile(profile);
        console.log(result.stopped ? colors.green(`[stop] ${result.message}`) : colors.yellow(`[stop] ${result.message}`));
      } else {
        console.log(colors.dim(`Server is still running. Stop with: local-llm stop ${profile.id}`));
      }
    }
  } finally {
    tail.stop();
  }
}

async function stopCommand(argv) {
  const profile = await readProfileArg(argv);
  const result = await stopProfile(profile);
  console.log(result.stopped ? colors.green(result.message) : colors.yellow(result.message));
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
  const commandText = await readFile(profile.commandPath, "utf8").catch(() => buildPrettyCommand(profile));
  const piConfigured = await hasPiModel(profile);
  const openCodeConfigured = await hasOpenCodeModel(profile);
  return [
    colors.bold(colors.cyan(profile.label)),
    "",
    renderSection("Profile", renderRows([
      ["ID", colors.cyan(profile.id)],
      ["Endpoint", colors.green(profile.baseUrl)],
      ["Alias", colors.cyan(profile.modelAlias)],
      ["Model", colors.dim(profile.modelPath)],
      ["MMProj", profile.mmprojPath ? colors.dim(profile.mmprojPath) : colors.yellow("none")]
    ])),
    "",
    renderSection("Memory", withoutFirstLine(renderEstimate(profile))),
    "",
    renderSection("How estimate works", withoutFirstLine(renderEstimateExplanation(profile))),
    "",
    renderSection("Harness", renderRows([
      ["Pi", `${configBadge(piConfigured)} ${colors.cyan(profile.harnesses.pi.model)}`],
      ["OpenCode", `${configBadge(openCodeConfigured)} ${colors.cyan(profile.harnesses.opencode.model)}`]
    ])),
    "",
    renderSection("Editable command file", colors.dim(profile.commandPath)),
    "",
    renderSection("Command", highlightShell(commandText.trim())),
    "",
    renderSection("Next", [
      `${colors.green("Run:")}  local-llm run ${profile.id} --with pi`,
      `${colors.cyan("Edit:")} ${profile.commandPath}`,
      colors.dim(`Metadata: ${profilePath(profile.id)}`)
    ].join("\n"))
  ].join("\n");
}

function renderProfileSummary(profile) {
  return renderSection("Profile", renderRows([
    ["ID", colors.cyan(profile.id)],
    ["Label", colors.bold(profile.label)],
    ["Endpoint", colors.green(profile.baseUrl)],
    ["Alias", colors.cyan(profile.modelAlias)],
    ["Model", colors.dim(profile.modelPath)],
    ["MMProj", profile.mmprojPath ? colors.dim(profile.mmprojPath) : colors.yellow("none")]
  ]));
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
