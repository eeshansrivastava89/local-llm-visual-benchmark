import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { RunPaths } from "./paths";
import type { RunError, RunMetadata } from "./types";

export type RunMetadataUpdate = Partial<Omit<RunMetadata, "runId">>;

export async function writeRunMetadata(
  paths: RunPaths,
  metadata: RunMetadata
): Promise<void> {
  await mkdir(paths.runDirectory, { recursive: true });
  await writePrettyJson(paths.metadataPath, metadata);
}

export async function writeRawResponse(
  paths: RunPaths,
  rawResponse: string
): Promise<void> {
  await mkdir(paths.runDirectory, { recursive: true });
  await writeFile(paths.rawResponsePath, rawResponse, "utf8");
}

export async function writePromptMarkdown(
  paths: RunPaths,
  prompt: string
): Promise<void> {
  await mkdir(paths.runDirectory, { recursive: true });
  await writeFile(paths.promptPath, prompt, "utf8");
}

export async function writeRunHtml(paths: RunPaths, html: string): Promise<void> {
  await mkdir(paths.runDirectory, { recursive: true });
  await writeFile(paths.htmlPath, html, "utf8");
}

export async function readRunMetadata(paths: RunPaths): Promise<RunMetadata> {
  return JSON.parse(await readFile(paths.metadataPath, "utf8")) as RunMetadata;
}

export interface DeleteRunDirectoryInput {
  runsRoot?: string;
  runDirectory: string;
}

export async function deleteRunDirectory(input: DeleteRunDirectoryInput): Promise<void> {
  const runsRoot = resolve(input.runsRoot ?? join(process.cwd(), "runs"));
  const runDirectory = resolve(input.runDirectory);

  if (runDirectory === runsRoot || !isPathInside(runDirectory, runsRoot)) {
    throw new Error("Run directory is outside the configured runs folder.");
  }

  await rm(runDirectory, { recursive: true, force: false });
}

export async function listRunMetadata(
  runsRoot = join(process.cwd(), "runs")
): Promise<RunMetadata[]> {
  const runMetadata: RunMetadata[] = [];
  const benchmarkDirectories = await readDirectoriesIfPresent(runsRoot);

  for (const benchmarkDirectory of benchmarkDirectories) {
    const benchmarkPath = join(runsRoot, benchmarkDirectory);
    const modelDirectories = await readDirectoriesIfPresent(benchmarkPath);

    for (const modelDirectory of modelDirectories) {
      const modelPath = join(benchmarkPath, modelDirectory);
      const runDirectories = await readDirectoriesIfPresent(modelPath);

      for (const runDirectory of runDirectories) {
        const metadataPath = join(modelPath, runDirectory, "metadata.json");
        const metadata = await readMetadataIfPresent(metadataPath);

        if (metadata) {
          runMetadata.push(metadata);
        }
      }
    }
  }

  return runMetadata.sort((left, right) =>
    sortTimestamp(right).localeCompare(sortTimestamp(left))
  );
}

export async function updateRunMetadata(
  paths: RunPaths,
  update: RunMetadataUpdate
): Promise<RunMetadata> {
  const current = await readRunMetadata(paths);
  const next: RunMetadata = {
    ...current,
    ...update
  };

  await writeRunMetadata(paths, next);
  return next;
}

export async function markRunFailed(
  paths: RunPaths,
  error: unknown,
  now = new Date()
): Promise<RunMetadata> {
  const timestamp = now.toISOString();

  return updateRunMetadata(paths, {
    status: "failed",
    updatedAt: timestamp,
    failedAt: timestamp,
    error: toRunError(error)
  });
}

export async function markRunCancelled(
  paths: RunPaths,
  error: unknown,
  now = new Date()
): Promise<RunMetadata> {
  const timestamp = now.toISOString();

  return updateRunMetadata(paths, {
    status: "cancelled",
    updatedAt: timestamp,
    cancelledAt: timestamp,
    error: toRunError(error)
  });
}

function toRunError(error: unknown): RunError {
  if (error instanceof Error) {
    return {
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {})
    };
  }

  return {
    message: String(error)
  };
}

async function writePrettyJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readDirectoriesIfPresent(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }

    throw error;
  }
}

async function readMetadataIfPresent(path: string): Promise<RunMetadata | undefined> {
  try {
    const metadata = JSON.parse(await readFile(path, "utf8")) as RunMetadata;
    return hydrateAssetAvailability(metadata);
  } catch (error) {
    if (isMissingPathError(error) || error instanceof SyntaxError) {
      return undefined;
    }

    throw error;
  }
}

async function hydrateAssetAvailability(metadata: RunMetadata): Promise<RunMetadata> {
  const declared = metadata.assets ?? {};
  const checks = await Promise.all([
    assetExists(metadata, declared.prompt),
    assetExists(metadata, declared.rawResponse),
    assetExists(metadata, declared.html),
    assetExists(metadata, declared.preview),
    assetExists(metadata, declared.video),
    assetExists(metadata, declared.videoMp4)
  ]);

  const assets: RunMetadata["assets"] = {
    metadata: declared.metadata ?? "metadata.json"
  };

  if (checks[0]) assets.prompt = declared.prompt;
  if (checks[1]) assets.rawResponse = declared.rawResponse;
  if (checks[2]) assets.html = declared.html;
  if (checks[3]) assets.preview = declared.preview;
  if (checks[4]) assets.video = declared.video;
  if (checks[5]) assets.videoMp4 = declared.videoMp4;

  const promptText = assets.prompt
    ? await readAssetTextIfPresent(metadata, assets.prompt)
    : undefined;

  return {
    ...metadata,
    assets,
    ...(promptText !== undefined ? { promptText } : {})
  };
}

async function readAssetTextIfPresent(
  metadata: RunMetadata,
  asset: string
): Promise<string | undefined> {
  try {
    return await readFile(join(metadata.runDirectory, asset), "utf8");
  } catch (error) {
    if (isMissingPathError(error)) {
      return undefined;
    }

    throw error;
  }
}

async function assetExists(metadata: RunMetadata, asset?: string): Promise<boolean> {
  if (!asset || !metadata.runDirectory) {
    return false;
  }

  try {
    const result = await stat(join(metadata.runDirectory, asset));
    return result.isFile();
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }

    throw error;
  }
}

function sortTimestamp(metadata: RunMetadata): string {
  return metadata.updatedAt || metadata.createdAt || metadata.runId;
}

function isPathInside(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}${sep}`);
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
