import { mkdir, readFile, writeFile } from "node:fs/promises";
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

export async function writeRunHtml(paths: RunPaths, html: string): Promise<void> {
  await mkdir(paths.runDirectory, { recursive: true });
  await writeFile(paths.htmlPath, html, "utf8");
}

export async function readRunMetadata(paths: RunPaths): Promise<RunMetadata> {
  return JSON.parse(await readFile(paths.metadataPath, "utf8")) as RunMetadata;
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
