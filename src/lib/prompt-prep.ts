import { mkdir } from "node:fs/promises";
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
