import { mkdir, readdir, readFile, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { isPathInside, resolveRunAssetPath } from "./asset-paths.ts";
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
  await pruneEmptyParents(dirname(runDirectory), runsRoot);
}

export async function listRunMetadata(
  runsRoot = join(process.cwd(), "runs")
): Promise<RunMetadata[]> {
  const metadataPaths = await findMetadataFiles(runsRoot);
  const runMetadata = (
    await Promise.all(metadataPaths.map((path) => readMetadataIfPresent(path)))
  ).filter((metadata): metadata is RunMetadata => Boolean(metadata));

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

async function findMetadataFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  await collectMetadataFiles(root, result, 0);
  return result.sort((left, right) => left.localeCompare(right));
}

async function collectMetadataFiles(
  directory: string,
  result: string[],
  depth: number
): Promise<void> {
  const entries = await readDirentsIfPresent(directory);
  const hasMetadata = entries.some(
    (entry) => entry.isFile() && entry.name === "metadata.json"
  );

  if (hasMetadata) {
    result.push(join(directory, "metadata.json"));
    return;
  }

  if (depth >= 5) {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      await collectMetadataFiles(join(directory, entry.name), result, depth + 1);
    }
  }
}

async function readDirentsIfPresent(path: string) {
  try {
    return await readdir(path, { withFileTypes: true });
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
    if (metadata.kind && metadata.kind !== "visual") {
      return undefined;
    }
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
    assetExists(metadata, declared.request),
    assetExists(metadata, declared.stream),
    assetExists(metadata, declared.response),
    assetExists(metadata, declared.command),
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
  if (checks[2]) assets.request = declared.request;
  if (checks[3]) assets.stream = declared.stream;
  if (checks[4]) assets.response = declared.response;
  if (checks[5]) assets.command = declared.command;
  if (checks[6]) assets.html = declared.html;
  if (checks[7]) assets.preview = declared.preview;
  if (checks[8]) assets.video = declared.video;
  if (checks[9]) assets.videoMp4 = declared.videoMp4;

  const promptText = assets.prompt
    ? await readAssetTextIfPresent(metadata, assets.prompt)
    : undefined;

  return {
    ...metadata,
    kind: metadata.kind ?? "visual",
    assets,
    ...(promptText !== undefined ? { promptText } : {})
  };
}

async function readAssetTextIfPresent(
  metadata: RunMetadata,
  asset: string
): Promise<string | undefined> {
  try {
    return await readFile(resolveRunAssetPath(metadata.runDirectory, asset), "utf8");
  } catch (error) {
    if (isMissingPathError(error) || isUnsafeAssetPathError(error)) {
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
    const result = await stat(resolveRunAssetPath(metadata.runDirectory, asset));
    return result.isFile() || result.isDirectory();
  } catch (error) {
    if (isMissingPathError(error) || isUnsafeAssetPathError(error)) {
      return false;
    }

    throw error;
  }
}

function sortTimestamp(metadata: RunMetadata): string {
  return metadata.updatedAt || metadata.createdAt || metadata.runId;
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function isUnsafeAssetPathError(error: unknown): boolean {
  return error instanceof Error && /Asset path must stay inside a run folder/u.test(error.message);
}

async function pruneEmptyParents(directory: string, stopAt: string): Promise<void> {
  let current = resolve(directory);

  while (current !== stopAt && isPathInside(current, stopAt)) {
    try {
      await rmdir(current);
    } catch (error) {
      if (isNonEmptyDirectoryError(error) || isMissingPathError(error)) {
        return;
      }

      throw error;
    }

    current = dirname(current);
  }
}

function isNonEmptyDirectoryError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "ENOTEMPTY" || error.code === "EEXIST")
  );
}
