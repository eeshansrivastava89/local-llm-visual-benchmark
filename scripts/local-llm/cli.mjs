import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ensureLocalDirs, RUN_DIR, ROOT } from "./paths.mjs";
import { PRESETS } from "./presets.mjs";
import { scanGgufModels } from "./scan.mjs";
import { ensureProfileCommand, loadProfiles, profileExists, readProfile, saveProfile, profilePath, profileTimestamp, sanitizeProfileId, slugFromLabel, normalizeProfile, deleteProfile } from "./profiles.mjs";
import { buildPrettyCommand } from "./command.mjs";
import { estimateMemory } from "./estimate.mjs";
import { colors, createPrompt, formatBytes, parseOptions, printHelp, relativeTime, renderRows, renderSection, startInteractive } from "./ui.mjs";
import { hasOpenCodeModel, hasPiModel, launchHarness, syncOpenCodeConfig, syncPiConfig, removeFromPiConfig, removeFromOpenCodeConfig } from "./harnesses.mjs";
import { isProfileRunning, profileRuntimeStatus, serverReady, startServer, stopProfile, waitForReady } from "./process.mjs";
import { tailFriendly } from "./logs.mjs";
import { backendFor, BACKENDS } from "./backends.mjs";
import { SERVER_VARIANTS, serverBinaryFor, inferServerVariantId } from "./server-variants.mjs";
import { slugModelId, createRunId, buildToolPrompt, loadBenchmarks, loadCloudModels } from "./shared/run-utils.mjs";

export async function runCli(argv) {
  const [command = "help", ...args] = argv;
  if (["help", "--help", "-h"].includes(command)) return printHelp();
  if (command === "models") return modelsCommand(args);
  if (command === "run") return runCommand(args);
  if (command === "stop") return stopCommand(args);
  throw new Error(`Unknown command: ${command}. Run local-llm help`);
}

async function modelsCommand(argv) {
  const what = argv[0];
  if (what && what !== "profiles" && !what.startsWith("-")) return listProfile(what);
  return listAll();
}

async function listProfile(id) {
  const profile = await ensureProfileCommand(await readProfile(id));
  console.log(await renderFullProfile(profile));
}

async function listAll() {
  if (process.stdin.isTTY) startInteractive("local-llm models");
  await ensureLocalDirs();
  const profiles = await Promise.all((await loadProfiles()).map(async (profile) => {
    const backend = backendFor(profile.backend);
    return backend.needsCommandFile ? ensureProfileCommand(profile) : profile;
  }));
  const ggufModels = await scanGgufModels();
  const profiledModelPaths = new Set(profiles.map((profile) => profile.modelPath).filter(Boolean));
  const unprofiledGguf = ggufModels.filter((model) => !profiledModelPaths.has(model.path));
  const items = [];

  console.log(colors.bold("Saved profiles"));
  if (profiles.length === 0) {
    console.log(colors.yellow("  None yet. Download a model, then choose Set up from local-llm models"));
  } else {
    const backendColors = {
      "llama-cpp": colors.yellow,
      "llama-cpp-mtp": colors.blue,
      "ollama": colors.magenta,
      "omlx": colors.cyan
    };
    const backendOrder = ["llama-cpp", "llama-cpp-mtp", "ollama", "omlx"];
    const groups = new Map();
    for (const beId of backendOrder) groups.set(beId, []);
    for (const profile of profiles) {
      const beId = profile.backend ?? "llama-cpp";
      if (!groups.has(beId)) groups.set(beId, []);
      groups.get(beId).push(profile);
    }
    let firstGroup = true;
    for (const beId of backendOrder) {
      const group = groups.get(beId);
      if (!group || group.length === 0) continue;
      const backend = backendFor(beId);
      const colorFn = backendColors[beId] ?? colors.magenta;
      if (!firstGroup) console.log("");
      firstGroup = false;
      console.log(colorFn(colors.bold(backend.label)));
      for (const profile of group) {
        const index = items.push({ type: "profile", profile });
        const running = await isProfileRunning(profile);
        const timestamp = await profileTimestamp(profile.id);
        const missing = backend.needsModelFile ? missingProfileFiles(profile) : "";
        const sizeTag = profile.modelPath && existsSync(profile.modelPath) ? ` · ${colors.dim(formatBytes(statSync(profile.modelPath).size))}` : "";
        console.log(`${String(index).padStart(2, " ")}. ${running ? colors.green("●") : colors.dim("○")} ${colors.bold(profile.label)} ${colors.dim(relativeTime(timestamp))}`);
        console.log(`    id: ${colors.cyan(profile.id)} · alias: ${colors.cyan(profile.modelAlias)} · ${profile.baseUrl}${sizeTag}${missing ? ` · ${colors.red(missing)}` : ""}`);
      }
    }
    for (const [beId, group] of groups) {
      if (backendOrder.includes(beId) || group.length === 0) continue;
      const backend = backendFor(beId);
      const colorFn = backendColors[beId] ?? colors.magenta;
      console.log("");
      console.log(colorFn(colors.bold(backend.label)));
      for (const profile of group) {
        const index = items.push({ type: "profile", profile });
        const running = await isProfileRunning(profile);
        const timestamp = await profileTimestamp(profile.id);
        const missing = backend.needsModelFile ? missingProfileFiles(profile) : "";
        const sizeTag = profile.modelPath && existsSync(profile.modelPath) ? ` · ${colors.dim(formatBytes(statSync(profile.modelPath).size))}` : "";
        console.log(`${String(index).padStart(2, " ")}. ${running ? colors.green("●") : colors.dim("○")} ${colors.bold(profile.label)} ${colors.dim(relativeTime(timestamp))}`);
        console.log(`    id: ${colors.cyan(profile.id)} · alias: ${colors.cyan(profile.modelAlias)} · ${profile.baseUrl}${sizeTag}${missing ? ` · ${colors.red(missing)}` : ""}`);
      }
    }
  }
  console.log("");

  console.log(colors.bold("Downloaded models not set up yet"));
  const visibleModels = unprofiledGguf;
  if (visibleModels.length === 0) {
    console.log(colors.dim("  None. Every downloaded GGUF has a profile."));
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
        const badgeColor = {ollama: colors.magenta, omlx: colors.cyan}[beId] ?? colors.magenta;
        console.log(`${String(index).padStart(2, " ")}. ${colors.cyan(model.label)} ${badgeColor(`[${be.label}]`)}${model.sizeBytes ? ` · ${colors.dim(formatBytes(model.sizeBytes))}` : ""}`);
        console.log(`    id: ${colors.cyan(model.id)}${model.quant ? ` · quant: ${colors.dim(model.quant)}` : ""}${model.family ? ` · family: ${colors.dim(model.family)}` : ""}`);
      }
    }
  }

  // Cloud model entries — from past runs, plus a new option
  const existingCloudModels = await loadCloudModels(resolve(ROOT, "runs"));
  console.log("");
  console.log(colors.bold("Cloud models"));
  for (const cm of existingCloudModels) {
    const cmIndex = items.push({ type: "cloud", modelId: cm.id });
    console.log(`${String(cmIndex).padStart(2, " ")}. ${colors.magenta(cm.id)}`);
  }
  const newCloudIndex = items.push({ type: "cloud", modelId: null });
  console.log(`${String(newCloudIndex).padStart(2, " ")}. ${colors.dim("New cloud model")} ${colors.dim("· API-based")}`);

  if (process.stdin.isTTY && items.length > 0) {
    const prompt = createPrompt();
    try {
      const action = await prompt.choice("What do you want to do?", [
        { value: "inspect", label: "Inspect", hint: "View details" },
        { value: "setup", label: "Set up", hint: "Create or re-sync a profile" },
        { value: "run", label: "Run", hint: "Start server and launch a harness" },
        { value: "benchmark", label: "Benchmark", hint: "Run a benchmark prompt" },
        { value: "remove", label: "Remove", hint: "Delete a profile" }
      ], "inspect");
      const input = await prompt.text("Select a number", "");
      if (!input) return;
      const index = Number(input) - 1;
      if (Number.isNaN(index) || index < 0 || index >= items.length) {
        console.log(colors.yellow(`No item ${input}.`));
        return;
      }
      const item = items[index];
      if (action === "inspect") {
        if (item.type === "profile") {
          const backend = backendFor(item.profile.backend);
          console.log("\n" + await renderFullProfile(backend.needsCommandFile ? await ensureProfileCommand(item.profile) : item.profile));
        } else if (item.type === "managed") {
          console.log("\n" + renderManagedModelDetails(item.model, BACKENDS[item.backendId]));
        } else if (item.type === "cloud") {
          console.log(colors.dim("Cloud models are benchmarked by name. Use Benchmark to start a run."));
        } else {
          console.log("\n" + renderModelDetails(item.model));
        }
      } else if (action === "setup") {
        if (item.type === "profile") {
          await syncHarnessConfigs(item.profile, await prompt.choice("Sync", syncChoices(), "both"));
        } else if (item.type === "managed") {
          await setupManagedProfile(item.model, item.backendId);
        } else if (item.type === "cloud") {
          console.log(colors.yellow("Cloud models don't need a local profile. Use Benchmark to start a run."));
        } else {
          await setupGgufProfile(item.model);
        }
      } else if (action === "run") {
        if (item.type === "profile") {
          await runFromProfile(item.profile);
        } else if (item.type === "cloud") {
          console.log(colors.yellow("Cloud models don't run a local server. Use Benchmark to start a run."));
        } else {
          console.log(colors.yellow("Set up a profile first, then run it."));
        }
      } else if (action === "benchmark") {
        if (item.type === "profile") {
          await benchmarkFromProfile(item.profile);
        } else if (item.type === "cloud") {
          await benchmarkFromCloudModel(item.modelId);
        } else {
          console.log(colors.yellow("Set up a profile first, then benchmark it."));
        }
      } else if (action === "remove") {
        if (item.type === "profile") {
          await removeProfile(item.profile.id, {});
        } else if (item.type === "cloud") {
          console.log(colors.yellow("Cloud models have no profile to remove."));
        } else {
          console.log(colors.yellow("Only saved profiles can be removed. Use Set up to create one first."));
        }
      }
    } finally {
      prompt.close();
    }
  }
}

function renderModelDetails(model) {
  const lines = [
    colors.bold(model.label),
    `Alias:  ${model.aliasSuggestion}`,
    `Model:  ${model.path}`,
    `MMProj: ${model.mmprojPath ?? "none"}`,
    `Size:   ${formatBytes(model.sizeBytes)}`,
    "",
    colors.dim("Use local-llm models → Set up to create a profile."),
    ""
  ];
  return lines.join("\n");
}

// ── Setup flows ──────────────────────────────────────────────────────────

async function setupGgufProfile(model) {
  await ensureLocalDirs();
  if (!process.stdin.isTTY) throw new Error("Interactive setup requires a terminal.");
  startInteractive("local-llm setup");
  const prompt = createPrompt();
  try {
    const existing = (await loadProfiles()).find((p) => p.modelPath === model.path);
    if (existing) {
      const enhanced = await ensureProfileCommand(existing);
      console.log(renderProfileSummary(enhanced));
      console.log(colors.bold("Already set up"));
      const sync = await prompt.choice("Update harness configs?", syncChoices(), "both");
      await syncHarnessConfigs(enhanced, sync);
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

    const id = sanitizeProfileId(await prompt.text("Profile id", slugFromLabel(model.label)));
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

    const est = estimateMemory(profile);
    console.log();
    console.log(renderSection("Memory", renderRows([
      ["Estimated total", colors.bold(`~${formatBytes(est.totalBytes)}`)],
      ["Model", formatBytes(est.modelBytes)],
      ["KV cache", est.kvBytes ? `~${formatBytes(est.kvBytes)} (ctx ${profile.flags.ctxSize}, ${profile.flags.parallel ?? 1} slot, ${profile.flags.cacheTypeK}/${profile.flags.cacheTypeV})` : "unknown"],
      ...(est.note ? [["Note", colors.yellow(est.note)]] : [])
    ])));
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

async function setupManagedProfile(model, backendId) {
  await ensureLocalDirs();
  if (!process.stdin.isTTY) throw new Error("Interactive setup requires a terminal.");
  const backend = backendFor(backendId);
  startInteractive("local-llm setup");
  const prompt = createPrompt();
  try {
    const existing = (await loadProfiles()).find((p) => {
      if (backendId === "ollama") return p.backend === "ollama" && (p.ollamaModel === model.id || p.modelAlias === model.id);
      if (backendId === "omlx") return p.backend === "omlx" && (p.omlxModel === model.id || p.modelAlias === model.id);
      return false;
    });
    if (existing) {
      const enhanced = await ensureProfileCommand(existing);
      console.log(renderProfileSummary(enhanced));
      console.log(colors.bold("Already set up"));
      const sync = await prompt.choice("Update harness configs?", syncChoices(), "both");
      await syncHarnessConfigs(enhanced, sync);
      return;
    }

    const id = sanitizeProfileId(await prompt.text("Profile id", slugFromLabel(model.label)));
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
  } finally {
    prompt.close();
  }
}

// ── Run from models ─────────────────────────────────────────────────────

async function runFromProfile(profile) {
  const prompt = createPrompt();
  try {
    const withHarness = await prompt.choice("Harness", [
      { value: "pi", label: "Pi" },
      { value: "opencode", label: "OpenCode" },
      { value: "server", label: "Server only" }
    ], "pi");
    await runProfile(await ensureProfileCommand(profile), { with: withHarness === "server" ? null : withHarness });
  } finally {
    prompt.close();
  }
}

// ── Benchmark from models ───────────────────────────────────────────────

async function benchmarkFromProfile(profile) {
  const benchDir = resolve(ROOT, "benchmarks");
  const runsDir = resolve(ROOT, "runs");

  const benchmarks = await loadBenchmarks(benchDir);
  if (benchmarks.length === 0) {
    console.log(colors.yellow(`No benchmarks found in ${benchDir}`));
    return;
  }

  const prompt = createPrompt();
  try {
    const kind = await prompt.choice("Category", [
      { value: "visual", label: "Visual Benchmark", hint: "HTML/CSS/JS animation benchmarks" },
      { value: "data-science", label: "Data Science", hint: "Analysis and charting benchmarks" }
    ], "visual");

    const filtered = benchmarks.filter((b) => b.kind === kind);
    if (filtered.length === 0) {
      console.log(colors.yellow(`No ${kind} benchmarks found.`));
      return;
    }

    const benchmarkId = await prompt.choice("Prompt", filtered.map((b) => ({
      value: b.id,
      label: b.title,
      hint: b.description || b.id
    })), filtered[0].id);
    const selectedBenchmark = filtered.find((b) => b.id === benchmarkId);
    if (!selectedBenchmark) throw new Error(`Benchmark "${benchmarkId}" not found.`);

    const runner = await prompt.choice("Harness", [
      { value: "pi", label: "Pi" },
      { value: "opencode", label: "OpenCode" },
      { value: "manual", label: "Manual chat", hint: "copy the prompt yourself" }
    ], "pi");

  const backend = backendFor(profile.backend);
  const modelId = profile.modelAlias;
  const modelSource = profile.providerId === "llama-cpp-mtp" ? "llama-cpp-mtp" : profile.backend === "ollama" ? "ollama" : profile.backend === "omlx" ? "omlx" : "llama-cpp";
  const backendLabel = backend.label;
  const baseUrl = profile.baseUrl;
  const toolPrompt = buildToolPrompt(selectedBenchmark, kind);

  const now = new Date();
  const runId = createRunId(now);
  const modelSlug = slugModelId(modelId);
  const benchmarkDirectory = join(runsDir, selectedBenchmark.id);
  const modelDirectory = join(benchmarkDirectory, modelSlug);
  const runDirectory = join(modelDirectory, runId);

  await mkdir(runDirectory, { recursive: true });

  const isDs = kind === "data-science";
  const metadata = {
    schemaVersion: 1,
    kind,
    runId,
    benchmark: { id: selectedBenchmark.id, title: selectedBenchmark.title, description: selectedBenchmark.description, prompt: selectedBenchmark.prompt },
    model: { id: modelId, slug: modelSlug },
    status: "prepared",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    preparedAt: now.toISOString(),
    runDirectory,
    assets: isDs
      ? { metadata: "metadata.json", prompt: "prompt.md", rawResponse: "response.raw.txt", ds: { notebook: "analysis.ipynb", summary: "summary.json", chartDistribution: "chart-distribution.png", chartTreatmentEffect: "chart-treatment-effect.png", chartCompletionRates: "chart-completion-rates.png" } }
      : { metadata: "metadata.json", prompt: "prompt.md", html: "index.html", preview: "preview.png", video: "preview.webm", rawResponse: "response.raw.txt" },
    runner: {
      mode: runner === "manual" ? "manual" : "external",
      modelSource,
      intendedRunner: runner === "pi" ? "Pi" : runner === "opencode" ? "OpenCode" : "manual",
      backendLabel,
      baseUrl,
      model: modelId,
      retries: 0,
      tokenMetrics: { reported: false }
    },
    tool: runner !== "manual" ? runner : undefined
  };

  await writeFile(join(runDirectory, "metadata.json"), JSON.stringify(metadata, null, 2) + "\n", "utf8");
  await writeFile(join(runDirectory, "prompt.md"), toolPrompt + "\n", "utf8");

  if (isDs) {
    try {
      const envPath = resolve(ROOT, ".env");
      const envContent = await readFile(envPath, "utf8");
      const supabaseUrl = envContent.split("\n").find((l) => l.startsWith("SUPABASE_URL="))?.split("=")[1]?.trim();
      const supabaseKey = envContent.split("\n").find((l) => l.startsWith("SUPABASE_ANON_KEY="))?.split("=")[1]?.trim();
      if (supabaseUrl && supabaseKey) {
        await writeFile(join(runDirectory, "supabase.json"), JSON.stringify({
          url: `${supabaseUrl}/rest/v1/posthog_events?select=*&session_id=not.is.null&variant=not.is.null`,
          headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
        }, null, 2) + "\n", "utf8");
      }
    } catch { /* no .env, skip supabase config */ }
  }

  console.log("");
  console.log(colors.bold(colors.green("✓ Run slot prepared")));
  console.log(renderSection("Run", renderRows([
    ["Directory", colors.cyan(runDirectory)],
    ["Benchmark", selectedBenchmark.title],
    ["Kind", kind],
    ["Model", colors.bold(modelId)],
    ["Source", backendLabel],
    ["Harness", runner === "pi" ? "Pi" : runner === "opencode" ? "OpenCode" : "Manual"]
  ])));
  console.log("");
  console.log(colors.bold("Prompt"));
  console.log(colors.dim("─".repeat(60)));
  console.log(toolPrompt);
  console.log(colors.dim("─".repeat(60)));
  console.log("");
  console.log(colors.bold("Next steps"));
  console.log(`  1. ${colors.cyan(`cd ${runDirectory}`)}`);
  if (runner === "manual") {
    console.log("  2. Copy the prompt above into your tool of choice.");
  } else {
    console.log(`  2. ${colors.cyan(`local-llm run ${profile.id} --with ${runner}`)}`);
  }
  } finally {
    prompt.close();
  }
}

// ── Benchmark cloud model ────────────────────────────────────────────────

async function benchmarkFromCloudModel(prequickModelId) {
  const benchDir = resolve(ROOT, "benchmarks");
  const runsDir = resolve(ROOT, "runs");

  const benchmarks = await loadBenchmarks(benchDir);
  if (benchmarks.length === 0) {
    console.log(colors.yellow(`No benchmarks found in ${benchDir}`));
    return;
  }

  const prompt = createPrompt();
  try {
    // Pick cloud model name — preselected from list or enter new
    let modelId = prequickModelId;
    if (!modelId) {
      const existingCloudModels = await loadCloudModels(runsDir);
      if (existingCloudModels.length > 0) {
        const modelChoice = await prompt.choice("Model", [
          ...existingCloudModels.map((m) => ({ value: m.id, label: m.label })),
          { value: "__new__", label: "New model", hint: "enter a cloud model name" }
        ], existingCloudModels[0].id);
        if (modelChoice === "__new__") {
          modelId = await prompt.text("Model name", "gpt-4o");
        } else {
          modelId = modelChoice;
        }
      } else {
        modelId = await prompt.text("Model name", "gpt-4o");
      }
    }
    if (!modelId) return;

    const kind = await prompt.choice("Category", [
      { value: "visual", label: "Visual Benchmark", hint: "HTML/CSS/JS animation benchmarks" },
      { value: "data-science", label: "Data Science", hint: "Analysis and charting benchmarks" }
    ], "visual");

    const filtered = benchmarks.filter((b) => b.kind === kind);
    if (filtered.length === 0) {
      console.log(colors.yellow(`No ${kind} benchmarks found.`));
      return;
    }

    const benchmarkId = await prompt.choice("Prompt", filtered.map((b) => ({
      value: b.id,
      label: b.title,
      hint: b.description || b.id
    })), filtered[0].id);
    const selectedBenchmark = filtered.find((b) => b.id === benchmarkId);
    if (!selectedBenchmark) throw new Error(`Benchmark "${benchmarkId}" not found.`);

    const toolPrompt = buildToolPrompt(selectedBenchmark, kind);

    const now = new Date();
    const runId = createRunId(now);
    const modelSlug = slugModelId(modelId);
    const benchmarkDirectory = join(runsDir, selectedBenchmark.id);
    const modelDirectory = join(benchmarkDirectory, modelSlug);
    const runDirectory = join(modelDirectory, runId);

    await mkdir(runDirectory, { recursive: true });

    const isDs = kind === "data-science";
    const metadata = {
      schemaVersion: 1,
      kind,
      runId,
      benchmark: { id: selectedBenchmark.id, title: selectedBenchmark.title, description: selectedBenchmark.description, prompt: selectedBenchmark.prompt },
      model: { id: modelId, slug: modelSlug },
      status: "prepared",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      preparedAt: now.toISOString(),
      runDirectory,
      assets: isDs
        ? { metadata: "metadata.json", prompt: "prompt.md", rawResponse: "response.raw.txt", ds: { notebook: "analysis.ipynb", summary: "summary.json", chartDistribution: "chart-distribution.png", chartTreatmentEffect: "chart-treatment-effect.png", chartCompletionRates: "chart-completion-rates.png" } }
        : { metadata: "metadata.json", prompt: "prompt.md", html: "index.html", preview: "preview.png", video: "preview.webm", rawResponse: "response.raw.txt" },
      runner: {
        mode: "manual",
        modelSource: "cloud",
        intendedRunner: "manual",
        backendLabel: "Cloud",
        model: modelId,
        retries: 0,
        tokenMetrics: { reported: false }
      }
    };

    await writeFile(join(runDirectory, "metadata.json"), JSON.stringify(metadata, null, 2) + "\n", "utf8");
    await writeFile(join(runDirectory, "prompt.md"), toolPrompt + "\n", "utf8");

    console.log("");
    console.log(colors.bold(colors.green("\u2713 Run slot prepared")));
    console.log(renderSection("Run", renderRows([
      ["Directory", colors.cyan(runDirectory)],
      ["Benchmark", selectedBenchmark.title],
      ["Kind", kind],
      ["Model", colors.bold(modelId)],
      ["Source", colors.magenta("Cloud")]
    ])));
    console.log("");
    console.log("");
    console.log(colors.bold("Prompt"));
    console.log(colors.dim("─".repeat(60)));
    console.log(toolPrompt);
    console.log(colors.dim("─".repeat(60)));
    console.log("");
    console.log(colors.bold("Next steps"));
    console.log(`  1. ${colors.cyan(`cd ${runDirectory}`)}`);
    console.log("  2. Copy the prompt above into your cloud model tool of choice.");
  } finally {
    prompt.close();
  }
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
  if (profiles.length === 0) throw new Error("No profiles yet. Run: local-llm models");
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
    const withHarness = requestedHarness ?? await prompt.choice("Harness", [
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
  if (withHarness === "pi" && !(await hasPiModel(profile))) await syncPiConfig(profile);
  if (withHarness === "opencode" && !(await hasOpenCodeModel(profile))) await syncOpenCodeConfig(profile);
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

// ── Stop ─────────────────────────────────────────────────────────────────

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

// ── Remove ───────────────────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────────

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
  const backendColors = {
    "llama-cpp": colors.yellow,
    "llama-cpp-mtp": colors.blue,
    "ollama": colors.magenta,
    "omlx": colors.cyan
  };
  const colorFn = backendColors[profile.backend] ?? colors.magenta;
  const sections = [
    colors.bold(colors.cyan(profile.label)),
    "",
    renderSection("Profile", renderRows([
      ["ID", colors.cyan(profile.id)],
      ["Endpoint", colors.green(profile.baseUrl)],
      ["Backend", colorFn(backend.label)],
      ["Provider", colors.cyan(profile.providerId)],
      ...(!isManaged ? [
        ["Server", colors.dim(serverBinaryFor(profile))],
        ["Model", renderPathStatus(profile.modelPath, "missing --model")],
        ["MMProj", profile.mmprojPath ? renderPathStatus(profile.mmprojPath, "missing mmproj") : colors.yellow("none")],
        ["Size", profile.modelPath && existsSync(profile.modelPath) ? formatBytes(statSync(profile.modelPath).size) : colors.dim("unknown")]
      ] : [
        ...(profile.backend === "ollama" ? [["Ollama model", colors.cyan(profile.ollamaModel ?? profile.modelAlias)]] : []),
        ...(profile.backend === "omlx" ? [["oMLX model", colors.cyan(profile.omlxModel ?? profile.modelAlias)]] : [])
      ]),
      ["Alias", colors.cyan(profile.modelAlias)]
    ])),
    ""
  ];
  if (!isManaged && !missing) {
    const est = estimateMemory(profile);
    sections.push(renderSection("Memory", renderRows([
      ["Estimated total", colors.bold(`~${formatBytes(est.totalBytes)}`)],
      ["Model", formatBytes(est.modelBytes)],
      ["KV cache", est.kvBytes ? `~${formatBytes(est.kvBytes)} (ctx ${profile.flags.ctxSize}, ${profile.flags.parallel ?? 1} slot, ${profile.flags.cacheTypeK}/${profile.flags.cacheTypeV})` : "unknown"],
      ...(est.note ? [["Note", colors.yellow(est.note)]] : [])
    ])));
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
    const withoutComments = commandText.trim().split("\n").filter((line) => !line.startsWith("#")).join("\n").replace(/^\n+/, "");
    sections.push("");
    sections.push(renderSection("Command", colors.dim(profile.commandPath)));
    sections.push(highlightShell(withoutComments));
  }
  sections.push("");
  sections.push(renderSection("Next", `${colors.green("Run:")} local-llm run ${profile.id} --with pi`));
  return sections.join("\n");
}

function renderProfileSummary(profile) {
  const backend = backendFor(profile.backend);
  const backendColors = {
    "llama-cpp": colors.yellow,
    "llama-cpp-mtp": colors.blue,
    "ollama": colors.magenta,
    "omlx": colors.cyan
  };
  const colorFn = backendColors[profile.backend] ?? colors.magenta;
  const badge = ` ${colorFn(`[${backend.label}]`)}`;
  const sizeTag = profile.modelPath && existsSync(profile.modelPath) ? ` · ${colors.dim(formatBytes(statSync(profile.modelPath).size))}` : "";
  return renderSection("Profile", renderRows([
    ["ID", colors.cyan(profile.id)],
    ["Label", colors.bold(profile.label) + badge],
    ["Endpoint", colors.green(profile.baseUrl)],
    ["Backend", colorFn(backend.label)],
    ["Provider", colors.cyan(profile.providerId)],
    ...(!backend.needsCommandFile ? [] : [
      ["Server", colors.dim(serverBinaryFor(profile))],
    ]),
    ["Alias", colors.cyan(profile.modelAlias)],
    ...(backend.needsModelFile ? [
      ["Model", renderPathStatus(profile.modelPath, "missing --model")],
      ["MMProj", profile.mmprojPath ? renderPathStatus(profile.mmprojPath, "missing mmproj") : colors.yellow("none")],
      ["Size", profile.modelPath && existsSync(profile.modelPath) ? formatBytes(statSync(profile.modelPath).size) : colors.dim("unknown")],
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
  const lines = [
    colors.bold(model.label),
    `Id:     ${model.id}`,
    `Source: ${backend.label}`,
    model.quant ? `Quant:  ${model.quant}` : null,
    model.family ? `Family: ${model.family}` : null,
    model.sizeBytes ? `Size:   ${formatBytes(model.sizeBytes)}` : null,
    "",
    colors.dim("Use local-llm models → Set up to create a profile."),
    ""
  ].filter(Boolean);
  return lines.join("\n");
}

function renderPathStatus(path, missingLabel) {
  if (!path) return colors.red(missingLabel);
  return existsSync(path) ? colors.dim(path) : `${colors.red(missingLabel)} ${colors.dim(path)}`;
}

function configBadge(configured) {
  return configured ? colors.green("configured") : colors.yellow("missing");
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
  return [
    { value: "standard", label: BACKENDS["llama-cpp"].label, hint: "manages llama-server process" },
    { value: "mtp", label: BACKENDS["llama-cpp-mtp"].label, hint: "speculative decoding with draft-mtp" }
  ];
}

function syncChoices() {
  return [
    { value: "both", label: "Pi and OpenCode" },
    { value: "pi", label: "Pi only" },
    { value: "opencode", label: "OpenCode only" },
    { value: "none", label: "None" }
  ];
}