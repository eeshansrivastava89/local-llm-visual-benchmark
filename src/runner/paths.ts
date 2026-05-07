import { createHash } from "node:crypto";
import { join } from "node:path";

const DEFAULT_MAX_SLUG_LENGTH = 80;

export interface BuildRunPathsInput {
  runsRoot?: string;
  benchmarkId: string;
  modelId: string;
  runId: string;
}

export interface RunPaths {
  runsRoot: string;
  benchmarkId: string;
  modelId: string;
  modelSlug: string;
  runId: string;
  benchmarkDirectory: string;
  modelDirectory: string;
  runDirectory: string;
  metadataPath: string;
  promptPath: string;
  rawResponsePath: string;
  htmlPath: string;
  previewPath: string;
  videoPath: string;
}

export function slugModelId(
  modelId: string,
  maxLength = DEFAULT_MAX_SLUG_LENGTH
): string {
  const hash = createHash("sha256").update(modelId).digest("hex").slice(0, 10);
  const normalized = modelId
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const slug = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  const needsHash = slug.length === 0 || slug !== normalized || slug.length > maxLength;

  if (!needsHash) {
    return slug;
  }

  const hashSuffixLength = hash.length + 1;
  const baseMaxLength = Math.max(1, maxLength - hashSuffixLength);
  const base = slug
    .slice(0, baseMaxLength)
    .replace(/^-+|-+$/g, "") || "model";

  return `${base}-${hash}`;
}

export function createRunId(date = new Date()): string {
  return date.toISOString().replace(/:/g, "-").replace(".", "-");
}

export function buildRunPaths(input: BuildRunPathsInput): RunPaths {
  const runsRoot = input.runsRoot ?? join(process.cwd(), "runs");
  const modelSlug = slugModelId(input.modelId);
  const benchmarkDirectory = join(runsRoot, input.benchmarkId);
  const modelDirectory = join(benchmarkDirectory, modelSlug);
  const runDirectory = join(modelDirectory, input.runId);

  return {
    runsRoot,
    benchmarkId: input.benchmarkId,
    modelId: input.modelId,
    modelSlug,
    runId: input.runId,
    benchmarkDirectory,
    modelDirectory,
    runDirectory,
    metadataPath: join(runDirectory, "metadata.json"),
    promptPath: join(runDirectory, "prompt.md"),
    rawResponsePath: join(runDirectory, "response.raw.txt"),
    htmlPath: join(runDirectory, "index.html"),
    previewPath: join(runDirectory, "preview.png"),
    videoPath: join(runDirectory, "preview.webm")
  };
}
