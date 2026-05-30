import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ROOT } from "./paths.mjs";
import { BACKENDS, backendFor } from "./backends.mjs";
import { scanGgufModels } from "./scan.mjs";
import { loadProfiles } from "./profiles.mjs";
import { colors, createPrompt, formatBytes, startInteractive } from "./ui.mjs";
import { slugModelId, createRunId, buildToolPrompt, loadBenchmarks } from "./shared/run-utils.mjs";

// ── Model source choices ───────────────────────────────────────────────

const MODEL_SOURCES = [
  { value: "profile", label: "Use existing profile", hint: "pick a saved local-llm profile" },
  { value: "ollama", label: "Ollama (managed)", hint: "pick a model from running Ollama service" },
  { value: "omlx", label: "oMLX (managed)", hint: "pick a model from running oMLX service" },
  { value: "llama-cpp", label: "llama.cpp (unprofiled)", hint: "pick a GGUF, does not create a profile" },
  { value: "custom", label: "Custom / cloud", hint: "free-form model label for manual runs" }
];

// ── Prepare command ────────────────────────────────────────────────────

export async function prepareCommand(argv) {
  const { positional, options } = parsePrepareOptions(argv);
  const benchDir = options.benchmarks ?? join(ROOT, "benchmarks");
  const runsDir = options.runs ?? join(ROOT, "runs");

  if (!process.stdin.isTTY) {
    throw new Error("Interactive prepare requires a terminal. Use: local-llm prepare");
  }

  startInteractive("local-llm prepare");
  const prompt = createPrompt();
  try {
    // ── 1. Pick kind (visual / data-science) ──
    const kind = await prompt.choice("Benchmark category", [
      { value: "visual", label: "Visual Benchmark", hint: "HTML/CSS/JS animation benchmarks" },
      { value: "data-science", label: "Data Science", hint: "Analysis and charting benchmarks" }
    ], "visual");

    // ── 2. Pick benchmark prompt ──
    const benchmarks = (await loadBenchmarks(benchDir)).filter((b) => b.kind === kind);
    if (benchmarks.length === 0) {
      throw new Error(`No ${kind} benchmarks found in ${benchDir}`);
    }
    const benchmarkId = await prompt.choice("Prompt", benchmarks.map((b) => ({
      value: b.id,
      label: b.title,
      hint: b.description || b.id
    })), benchmarks[0].id);
    const selectedBenchmark = benchmarks.find((b) => b.id === benchmarkId);
    if (!selectedBenchmark) throw new Error(`Benchmark "${benchmarkId}" not found.`);

    // ── 3. Pick model source ──
    const source = await prompt.choice("Model source", MODEL_SOURCES, "profile");

    let modelId, modelSource, runner, baseUrl, backendLabel;

    if (source === "profile") {
      const profiles = await loadProfiles();
      if (profiles.length === 0) throw new Error("No profiles yet. Run: local-llm setup");
      const profileId = await prompt.choice("Profile", await Promise.all(profiles.map(async (p) => {
        const be = backendFor(p.backend);
        return {
          value: p.id,
          label: p.label,
          hint: `${be.label} · ${p.modelAlias} · ${p.baseUrl}`
        };
      })), profiles[0].id);
      const profile = profiles.find((p) => p.id === profileId);
      if (!profile) throw new Error(`Profile "${profileId}" not found.`);
      modelId = profile.modelAlias;
      modelSource = profile.backend === "ollama" ? "ollama" : profile.backend === "omlx" ? "omlx" : "lmstudio";
      backendLabel = backendFor(profile.backend).label;
      baseUrl = profile.baseUrl;
    } else if (source === "ollama") {
      const models = await BACKENDS.ollama.scanModels();
      if (models.length === 0) throw new Error("No Ollama models found. Is Ollama running?");
      const modelChoice = await prompt.choice("Ollama model", models.map((m) => ({
        value: m.id,
        label: m.label,
        hint: [m.quant, m.family].filter(Boolean).join(" · ") || m.id
      })), models[0].id);
      modelId = modelChoice;
      modelSource = "ollama";
      backendLabel = "Ollama";
      baseUrl = "http://localhost:11434/v1";
    } else if (source === "omlx") {
      const models = await BACKENDS.omlx.scanModels();
      if (models.length === 0) throw new Error("No oMLX models found. Is oMLX running?");
      const modelChoice = await prompt.choice("oMLX model", models.map((m) => ({
        value: m.id,
        label: m.label,
        hint: m.id
      })), models[0].id);
      modelId = modelChoice;
      modelSource = "omlx";
      backendLabel = "oMLX";
      baseUrl = "http://127.0.0.1:8000/v1";
    } else if (source === "llama-cpp") {
      const ggufModels = await scanGgufModels();
      if (ggufModels.length === 0) throw new Error("No GGUF models found under ~/.lmstudio/models");
      const modelChoice = await prompt.choice("GGUF model", ggufModels.map((m) => ({
        value: m.path,
        label: m.label,
        hint: `${m.aliasSuggestion} · ${formatBytes(m.sizeBytes)}`
      })), ggufModels[0].path);
      modelId = ggufModels.find((m) => m.path === modelChoice)?.aliasSuggestion ?? "gguf-model";
      modelSource = "lmstudio";
      backendLabel = "llama.cpp";
      baseUrl = "http://127.0.0.1:8080/v1";
    } else {
      // Custom / cloud
      backendLabel = await prompt.text("Backend label", "cloud");
      modelId = await prompt.text("Model name", "");
      if (!modelId) throw new Error("Model name is required for custom source.");
      modelSource = "custom";
      baseUrl = "";
    }

    // ── 4. Pick harness ──
    runner = await prompt.choice("Coding harness", [
      { value: "manual", label: "Manual chat", hint: "copy the prompt yourself" },
      { value: "pi", label: "Pi", hint: "launch Pi with this model" },
      { value: "opencode", label: "OpenCode", hint: "launch OpenCode with this model" }
    ], "manual");

    // ── 5. Create the run directory ──
    const toolPrompt = buildToolPrompt(selectedBenchmark, kind);
    const now = new Date();
    const runId = createRunId(now);
    const modelSlug = slugModelId(modelId);
    const benchmarkDirectory = join(runsDir, selectedBenchmark.id);
    const modelDirectory = join(benchmarkDirectory, modelSlug);
    const runDirectory = join(modelDirectory, runId);

    await mkdir(runDirectory, { recursive: true });

    // Build metadata
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
        ...(modelSource && modelSource !== "custom" ? { modelSource } : { modelSource: "custom" }),
        intendedRunner: runnerLabel(runner),
        ...(backendLabel ? { backendLabel } : {}),
        ...(baseUrl ? { baseUrl } : {}),
        model: modelId,
        retries: 0,
        tokenMetrics: { reported: false }
      },
      ...(runner !== "manual" ? { tool: runner } : {})
    };

    await writeFile(join(runDirectory, "metadata.json"), JSON.stringify(metadata, null, 2) + "\n", "utf8");
    await writeFile(join(runDirectory, "prompt.md"), toolPrompt + "\n", "utf8");

    // Write supabase config for data-science
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

    // ── 6. Print result ──
    console.log("");
    console.log(colors.bold(colors.green("✓ Run slot prepared")));
    console.log(renderSection("Run", renderRows([
      ["Directory", colors.cyan(runDirectory)],
      ["Benchmark", selectedBenchmark.title],
      ["Kind", kind],
      ["Model", colors.bold(modelId)],
      ["Source", backendLabel || modelSource],
      ["Harness", runnerLabel(runner)]
    ])));
    console.log("");
    console.log(colors.bold("Next steps"));
    if (runner === "manual") {
      console.log(`  1. ${colors.cyan(`cd ${runDirectory}`)}`);
      console.log("  2. Copy the prompt below into your tool of choice.");
    } else {
      console.log(`  1. ${colors.cyan(`cd ${runDirectory}`)}`);
      console.log(`  2. The prompt is in ${colors.cyan("prompt.md")}.`);
    }

    if (source === "profile") {
      const profileId_used = positional[0] || "";
      console.log(`  3. To start server + harness: ${colors.cyan(`local-llm run ${profileId_used} --with ${runner}`)}`);
    }

    console.log("");
    console.log(colors.bold("Prompt"));
    console.log(colors.dim("─".repeat(60)));
    console.log(toolPrompt);
    console.log(colors.dim("─".repeat(60)));

    const promptPath = join(runDirectory, "prompt.md");
    console.log(`\n${colors.dim(`Prompt file: ${promptPath}`)}`);

    return { runDirectory, prompt: toolPrompt, metadata };
  } finally {
    prompt.close();
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function runnerLabel(runner) {
  if (runner === "pi") return "Pi";
  if (runner === "opencode") return "OpenCode";
  return "manual";
}

function renderSection(title, body) {
  return `${colors.magenta("◆")} ${colors.bold(title)}\n${body}`;
}

function renderRows(rows) {
  const width = Math.max(...rows.map(([key]) => stripAnsi(String(key)).length));
  return rows.map(([key, value]) => {
    const keyText = String(key);
    const visible = stripAnsi(keyText).length;
    return `${keyText}${" ".repeat(Math.max(1, width - visible + 2))}${value}`;
  }).join("\n");
}

function stripAnsi(value) {
  return value.replace(/\x1b\[[0-9;]*m/gu, "");
}

function parsePrepareOptions(argv) {
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