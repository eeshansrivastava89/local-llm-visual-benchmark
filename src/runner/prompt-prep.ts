import { mkdir } from "node:fs/promises";
import { appendHtmlOutputContract } from "./benchmarks";
import { buildRunPaths, createRunId } from "./paths";
import { writePromptMarkdown, writeRunMetadata } from "./runs";
import type { BenchmarkRecord, PreparedRun, RunMetadata } from "./types";

export type PromptTool = "opencode" | "pi" | "generic";

export interface PrepareRunInput {
  benchmark: BenchmarkRecord;
  modelId: string;
  tool?: PromptTool;
  runsRoot?: string;
  now?: Date;
}

export async function prepareRun(input: PrepareRunInput): Promise<PreparedRun> {
  const tool = input.tool ?? "generic";
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
    tool,
    runDirectory: paths.runDirectory,
    htmlPath: paths.htmlPath,
    previewPath: paths.previewPath
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
    tool,
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
  tool: PromptTool;
  runDirectory: string;
  htmlPath: string;
  previewPath: string;
}): string {
  const toolIntro = {
    opencode:
      "You are running inside OpenCode. Create or overwrite the requested artifact files directly on disk.",
    pi:
      "You are running inside Pi. Produce the requested visual artifact and save it to the exact local paths below.",
    generic:
      "Create the requested visual artifact and save it to the exact local paths below."
  } satisfies Record<PromptTool, string>;

  return [
    toolIntro[input.tool],
    "",
    `Model label: ${input.modelId}`,
    `Benchmark: ${input.benchmark.title} (${input.benchmark.id})`,
    `Run folder: ${input.runDirectory}`,
    "",
    "Required output:",
    `- Save one complete self-contained HTML document to: ${input.htmlPath}`,
    "- Do not place the final HTML in any other folder.",
    "- Do not require external network assets.",
    "- If your tool can create a screenshot, save a PNG preview to:",
    `  ${input.previewPath}`,
    "",
    appendHtmlOutputContract(input.benchmark.prompt)
  ].join("\n");
}
