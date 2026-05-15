import { mkdir } from "node:fs/promises";
import { buildRunPaths, createRunId } from "./paths";

import { writePromptMarkdown, writeRunMetadata } from "./runs";
import type { BenchmarkRecord, ModelSourceId, PreparedRun, RunnerMode, RunMetadata } from "./types";

export type PrepareRunRunner =
  | "manual"
  | "pi"
  | "opencode"
  | "hermes";

export interface PrepareRunInput {
  benchmark: BenchmarkRecord;
  modelId: string;
  modelSource?: ModelSourceId;
  runner?: PrepareRunRunner;
  baseUrl?: string;
  backendLabel?: string;
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
    benchmark: input.benchmark
  });
  const timestamp = now.toISOString();
  const modelSource = input.modelSource;
  const backendLabel = modelSource ? modelSourceLabel(modelSource, input.backendLabel) : undefined;
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
      rawResponse: "response.raw.txt"
    },
    runner: {
      mode: runnerModeFor(runner),
      ...(modelSource ? { modelSource } : {}),
      intendedRunner: runnerLabel(runner),
      backendLabel,
      baseUrl: normalizeOptionalString(input.baseUrl),
      model: input.modelId,
      retries: 0,
      tokenMetrics: {
        reported: false
      }
    },
    ...(runner === "manual" ? {} : { tool: runner })
  };

  await mkdir(paths.runDirectory, { recursive: true });
  const writes: Promise<unknown>[] = [writeRunMetadata(paths, run)];
  if (prompt) {
    writes.push(writePromptMarkdown(paths, prompt));
  }
  await Promise.all(writes);

  return {
    run,
    prompt,
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

export function buildToolPrompt(input: {
  benchmark: BenchmarkRecord;
}): string {
  return [
    "Create a complete, self-contained HTML file for the request below.",
    "Write the file as `index.html` in the current working directory.",
    "Do not create any folders, do not infer a filesystem path, and do not print the HTML in chat.",
    "",
    "The HTML must include all CSS and JavaScript inline and must not depend on external network assets.",
    "After building the page, run a visual QA pass with agent-browser or Playwright: open the saved index.html, inspect the rendered result, and fix any obvious layout, animation, console, or viewport issues before you finish.",
    "",
    input.benchmark.prompt.trim()
  ].join("\n");
}

function runnerModeFor(runner: PrepareRunRunner): RunnerMode {
  if (runner === "manual") return "manual";
  return "external";
}

function runnerLabel(runner: PrepareRunRunner): string {
  if (runner === "hermes") return "Hermes";
  if (runner === "opencode") return "OpenCode";
  if (runner === "pi") return "Pi";
  return "manual";
}

function modelSourceLabel(source: ModelSourceId, customLabel?: string): string {
  if (source === "omlx") return "oMLX";
  if (source === "lmstudio") return "LM Studio";
  return normalizeOptionalString(customLabel) ?? "Custom";
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
