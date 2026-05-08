import { mkdir } from "node:fs/promises";
import { appendHtmlOutputContract } from "./benchmarks";
import { buildRunPaths, createRunId } from "./paths";
import { writePromptMarkdown, writeRunMetadata } from "./runs";
import type { BenchmarkRecord, PreparedRun, RunMetadata } from "./types";

export type PromptTool = "opencode" | "pi" | "generic";

export interface PrepareRunInput {
  benchmark: BenchmarkRecord;
  modelId: string;
  runsRoot?: string;
  now?: Date;
}

export async function prepareRun(input: PrepareRunInput): Promise<PreparedRun> {
  const now = input.now ?? new Date();
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
  const timestamp = now.toISOString();
  const run: RunMetadata = {
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
    }
  };

  await mkdir(paths.runDirectory, { recursive: true });
  await Promise.all([
    writeRunMetadata(paths, run),
    writePromptMarkdown(paths, prompt)
  ]);

  return {
    run,
    prompt,
    paths: {
      runDirectory: paths.runDirectory,
      promptPath: paths.promptPath,
      htmlPath: paths.htmlPath,
      metadataPath: paths.metadataPath,
      previewPath: paths.previewPath
    }
  };
}

export function buildToolPrompt(input: {
  benchmark: BenchmarkRecord;
  modelId: string;
  runDirectory: string;
  htmlPath: string;
}): string {
  return [
    `Model label: ${input.modelId}`,
    `Benchmark: ${input.benchmark.title} (${input.benchmark.id})`,
    `Run folder: ${input.runDirectory}`,
    "",
    "Required output:",
    `- Save one complete self-contained HTML document to: ${input.htmlPath}`,
    "- Do not place the final HTML in any other folder.",
    "- Do not require external network assets.",
    "- Only create index.html; the benchmark viewer captures preview media after index.html exists.",
    "",
    appendHtmlOutputContract(input.benchmark.prompt)
  ].join("\n");
}
