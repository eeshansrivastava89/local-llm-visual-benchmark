import { mkdir, writeFile } from "node:fs/promises";
import { buildRunPaths, createRunId } from "./paths";
import { writePromptMarkdown, writeRunMetadata } from "./runs";
import type { BenchmarkRecord, PreparedRun, RunnerMode, RunMetadata } from "./types";

export type PrepareRunRunner =
  | "manual"
  | "pi"
  | "opencode"
  | "llama-cpp";

export const DEFAULT_LLAMA_CPP_BASE_URL = "http://127.0.0.1:8080/v1";
export const DEFAULT_LLAMA_CPP_COMMAND_TEMPLATE = [
  "llama-server \\",
  "  -m \\",
  "  <model-path> \\",
  "  --host 127.0.0.1 \\",
  "  --port 8080 \\",
  "  --ctx-size 8192 \\",
  "  --threads -1 \\",
  "  --n-gpu-layers 999 \\",
  "  --parallel 1"
].join("\n");

export interface PrepareRunInput {
  benchmark: BenchmarkRecord;
  modelId: string;
  runner?: PrepareRunRunner;
  baseUrl?: string;
  launchCommand?: string;
  modelPath?: string;
  runsRoot?: string;
  now?: Date;
}

export async function prepareRun(input: PrepareRunInput): Promise<PreparedRun> {
  const now = input.now ?? new Date();
  const runner = input.runner ?? "manual";
  const paths = buildRunPaths({
    runsRoot: input.runsRoot,
    benchmarkId: input.benchmark.id,
    modelId: input.modelId,
    runId: createRunId(now)
  });
  const prompt = buildToolPrompt({
    benchmark: input.benchmark,
    modelId: input.modelId,
    runDirectory: paths.runDirectory,
    htmlPath: paths.htmlPath
  });
  const command = buildPreparedCommand({
    benchmark: input.benchmark,
    modelId: input.modelId,
    runner,
    runDirectory: paths.runDirectory,
    baseUrl: input.baseUrl,
    launchCommand: input.launchCommand,
    modelPath: input.modelPath
  });
  const timestamp = now.toISOString();
  const run: RunMetadata = {
    schemaVersion: 1,
    kind: "visual",
    runId: paths.runId,
    benchmark: input.benchmark,
    model: {
      id: input.modelId,
      slug: paths.modelSlug
    },
    status: "prepared",
    createdAt: timestamp,
    updatedAt: timestamp,
    preparedAt: timestamp,
    runDirectory: paths.runDirectory,
    assets: {
      metadata: "metadata.json",
      prompt: "prompt.md",
      html: "index.html",
      preview: "preview.png",
      video: "preview.webm",
      rawResponse: "response.raw.txt",
      ...(command ? { command: "command.txt" } : {})
    },
    runner: {
      mode: runnerModeFor(runner),
      intendedRunner: runnerLabel(runner),
      backendLabel: runner === "llama-cpp" ? "llama.cpp" : runnerLabel(runner),
      baseUrl: runner === "llama-cpp"
        ? normalizeOptionalString(input.baseUrl) ?? DEFAULT_LLAMA_CPP_BASE_URL
        : undefined,
      model: input.modelId,
      launchCommand: command,
      commandAsset: command ? "command.txt" : undefined,
      retries: 0,
      tokenMetrics: {
        reported: false
      }
    }
  };

  await mkdir(paths.runDirectory, { recursive: true });
  const writes: Promise<unknown>[] = [writeRunMetadata(paths, run)];
  if (prompt) {
    writes.push(writePromptMarkdown(paths, prompt));
  }
  if (command) {
    writes.push(writeFile(paths.commandPath, command + "\n", "utf8"));
  }
  await Promise.all(writes);

  return {
    run,
    prompt,
    ...(command ? { command } : {}),
    paths: {
      runDirectory: paths.runDirectory,
      promptPath: paths.promptPath,
      commandPath: paths.commandPath,
      htmlPath: paths.htmlPath,
      metadataPath: paths.metadataPath,
      previewPath: paths.previewPath
    }
  };
}

export function buildPreparedCommand(input: {
  benchmark: BenchmarkRecord;
  modelId: string;
  runner: PrepareRunRunner;
  runDirectory: string;
  baseUrl?: string;
  launchCommand?: string;
  modelPath?: string;
}): string {
  const supplied = normalizeOptionalString(input.launchCommand);
  if (supplied) {
    return supplied.replaceAll("<prepared-run-folder>", input.runDirectory);
  }

  if (input.runner === "llama-cpp") {
    const modelPath = normalizeOptionalString(input.modelPath) ?? "/path/to/model.gguf";
    return DEFAULT_LLAMA_CPP_COMMAND_TEMPLATE.replaceAll("<model-path>", shellQuote(modelPath));
  }

  return "";
}

export function buildToolPrompt(input: {
  benchmark: BenchmarkRecord;
  modelId: string;
  runDirectory: string;
  htmlPath: string;
}): string {
  return [
    "Create a complete, self-contained HTML file for the request below.",
    "Do not print the HTML in chat. Write the file directly to this exact path:",
    "",
    input.htmlPath,
    "",
    "The HTML must include all CSS and JavaScript inline and must not depend on external network assets.",
    "Compose for a 1280x720 capture viewport; keep the main subject fully visible and centered at that resolution and common desktop sizes.",
    "",
    input.benchmark.prompt.trim()
  ].join("\n");
}

function runnerModeFor(runner: PrepareRunRunner): RunnerMode {
  if (runner === "llama-cpp") return "openai-compatible";
  if (runner === "manual") return "manual";
  return "external";
}

function runnerLabel(runner: PrepareRunRunner): string {
  if (runner === "llama-cpp") return "llama.cpp";
  if (runner === "opencode") return "OpenCode";
  if (runner === "pi") return "Pi";
  return "manual";
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function shellQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}
