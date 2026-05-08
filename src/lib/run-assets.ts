import { readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, join, normalize, resolve, sep } from "node:path";

const DEFAULT_RUNS_ROOT = join(process.cwd(), "runs");

const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".png", "image/png"],
  [".txt", "text/plain; charset=utf-8"],
  [".webm", "video/webm"]
]);

export interface ReadRunAssetInput {
  runsRoot?: string;
  runDirectory: string;
  asset: string;
}

export interface RunAssetFile {
  path: string;
  contentType: string;
  body: Uint8Array;
}

export async function readRunAsset(input: ReadRunAssetInput): Promise<RunAssetFile> {
  const runsRoot = resolve(input.runsRoot ?? DEFAULT_RUNS_ROOT);
  const runDirectory = resolve(input.runDirectory);
  const asset = normalize(input.asset);

  if (!isPathInside(runDirectory, runsRoot)) {
    throw new Error("Run directory is outside the configured runs folder.");
  }

  if (isAbsolute(asset) || asset.startsWith("..") || asset.includes(`${sep}..${sep}`)) {
    throw new Error("Asset path must stay inside a run folder.");
  }

  const assetPath = resolve(runDirectory, asset);

  if (!isPathInside(assetPath, runDirectory)) {
    throw new Error("Asset path must stay inside a run folder.");
  }

  const result = await stat(assetPath);

  if (!result.isFile()) {
    throw new Error("Asset path does not point to a file.");
  }

  return {
    path: assetPath,
    contentType: CONTENT_TYPES.get(extname(assetPath).toLowerCase()) ?? "application/octet-stream",
    body: await readFile(assetPath)
  };
}

function isPathInside(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}${sep}`);
}
