import { execFile } from "node:child_process";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { listRunMetadata } from "./runs";
import type { RunCaptureAsset, RunMetadata, ViewportSettings } from "./types";

const DEFAULT_VIEWPORT: ViewportSettings = {
  width: 1280,
  height: 720
};
const DEFAULT_CAPTURE_AT_MS = 5000;
const DEFAULT_VIDEO_DURATION_MS = 10000;
const DEFAULT_HTML_ASSET = "index.html";
const DEFAULT_PREVIEW_ASSET = "preview.png";
const DEFAULT_VIDEO_ASSET = "preview.webm";
const DEFAULT_MP4_ASSET = "preview.mp4";
const execFileAsync = promisify(execFile);

export interface CaptureLogger {
  log(message?: unknown, ...optionalParams: unknown[]): void;
  warn(message?: unknown, ...optionalParams: unknown[]): void;
  error(message?: unknown, ...optionalParams: unknown[]): void;
}

export interface CaptureMissingRunMediaOptions {
  runsRoot?: string;
  now?: Date;
  videoDurationMs?: number;
  captureRunMedia?: (run: RunMetadata, options: CaptureRunMediaOptions) => Promise<CaptureRunMediaResult>;
  logger?: CaptureLogger;
}

export interface CaptureSingleRunMediaOptions extends CaptureMissingRunMediaOptions {
  runDirectory: string;
}

export interface CaptureMissingRunMediaResult {
  captured: number;
  skipped: number;
  failed: number;
  runs: RunMetadata[];
}

export interface CaptureRunMediaOptions {
  now: Date;
  videoDurationMs: number;
}

export interface CaptureRunMediaResult {
  captured: boolean;
  run: RunMetadata;
}

export async function captureMissingRunMedia(
  options: CaptureMissingRunMediaOptions = {}
): Promise<CaptureMissingRunMediaResult> {
  const runsRoot = options.runsRoot;
  const captureRunMedia = options.captureRunMedia ?? captureRunMediaWithPlaywright;
  const videoDurationMs = options.videoDurationMs ?? DEFAULT_VIDEO_DURATION_MS;
  const logger = options.logger ?? console;
  const runs = await listRunMetadata(runsRoot);
  let captured = 0;
  let skipped = 0;
  let failed = 0;

  logger.log(`[capture] scanning ${runs.length} saved run(s) for missing media`);

  for (const run of runs) {
    const result = await captureOne(run, {
      captureRunMedia,
      logger,
      now: options.now ?? new Date(),
      videoDurationMs
    });
    captured += result.captured;
    skipped += result.skipped;
    failed += result.failed;
  }

  logger.log(`[capture] complete: ${captured} captured, ${skipped} skipped, ${failed} failed`);

  return {
    captured,
    skipped,
    failed,
    runs: await listRunMetadata(runsRoot)
  };
}

export async function captureSingleRunMedia(
  options: CaptureSingleRunMediaOptions
): Promise<CaptureMissingRunMediaResult> {
  const runsRoot = options.runsRoot;
  const logger = options.logger ?? console;
  const captureRunMedia = options.captureRunMedia ?? captureRunMediaWithPlaywright;
  const requestedDirectory = resolve(options.runDirectory);
  const runs = await listRunMetadata(runsRoot);
  const run = runs.find((item) => resolve(item.runDirectory) === requestedDirectory);

  if (!run) {
    throw new Error("Run directory was not found inside the configured runs folder.");
  }

  const result = await captureOne(run, {
    captureRunMedia,
    logger,
    now: options.now ?? new Date(),
    videoDurationMs: options.videoDurationMs ?? DEFAULT_VIDEO_DURATION_MS
  });

  return {
    ...result,
    runs: await listRunMetadata(runsRoot)
  };
}

async function captureOne(
  run: RunMetadata,
  options: {
    captureRunMedia: (run: RunMetadata, options: CaptureRunMediaOptions) => Promise<CaptureRunMediaResult>;
    logger: CaptureLogger;
    now: Date;
    videoDurationMs: number;
  }
): Promise<Omit<CaptureMissingRunMediaResult, "runs">> {
  if (!shouldCaptureRun(run)) {
    options.logger.log(`[capture] skipped ${runLabel(run)}: preview media already exists or source HTML is missing`);
    return { captured: 0, skipped: 1, failed: 0 };
  }

  options.logger.log(`[capture] starting ${runLabel(run)}`);

  try {
    const result = await options.captureRunMedia(run, {
      now: options.now,
      videoDurationMs: options.videoDurationMs
    });
    if (result.captured) {
      options.logger.log(`[capture] finished ${runLabel(run)}`);
      return { captured: 1, skipped: 0, failed: 0 };
    }

    options.logger.log(`[capture] skipped ${runLabel(run)}: capture produced no changes`);
    return { captured: 0, skipped: 1, failed: 0 };
  } catch (error) {
    options.logger.error(`[capture] failed ${runLabel(run)}:`, error);
    await markCaptureFailed(run, error, options.now);
    return { captured: 0, skipped: 0, failed: 1 };
  }
}

function shouldCaptureRun(run: RunMetadata): boolean {
  return Boolean(run.assets?.html && (!run.assets?.preview || !hasCapturedVideo(run)));
}

function hasCapturedVideo(run: RunMetadata): boolean {
  return Boolean(run.assets?.video || run.assets?.videoMp4);
}

function runLabel(run: RunMetadata): string {
  return `${run.benchmark?.id ?? "unknown-prompt"}/${run.model?.slug ?? run.model?.id ?? "unknown-model"}/${run.runId}`;
}

async function captureRunMediaWithPlaywright(
  run: RunMetadata,
  options: CaptureRunMediaOptions
): Promise<CaptureRunMediaResult> {
  const { chromium } = await import("@playwright/test");
  const viewport = run.settings?.preview?.viewport ?? DEFAULT_VIEWPORT;
  const captureAtMs = Math.min(
    run.settings?.preview?.captureAtMs ?? DEFAULT_CAPTURE_AT_MS,
    options.videoDurationMs
  );
  const needsPreview = !run.assets?.preview;
  const needsVideo = !hasCapturedVideo(run);
  const htmlAsset = run.assets?.html ?? DEFAULT_HTML_ASSET;
  const previewAsset = run.assets?.preview ?? DEFAULT_PREVIEW_ASSET;
  const videoAsset = run.assets?.video ?? DEFAULT_VIDEO_ASSET;
  const mp4Asset = run.assets?.videoMp4 ?? DEFAULT_MP4_ASSET;
  const htmlPath = join(run.runDirectory, htmlAsset);
  const previewPath = join(run.runDirectory, previewAsset);
  const videoPath = join(run.runDirectory, videoAsset);
  const mp4Path = join(run.runDirectory, mp4Asset);
  const videoDirectory = join(run.runDirectory, ".capture-video");
  let convertedMp4 = false;

  if (!needsPreview && !needsVideo) {
    return { captured: false, run };
  }

  await assertFileExists(htmlPath);
  await mkdir(run.runDirectory, { recursive: true });
  if (needsVideo) {
    await rm(videoDirectory, { recursive: true, force: true });
    await mkdir(videoDirectory, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  let video;

  try {
    const context = await browser.newContext({
      viewport,
      ...(needsVideo
        ? {
            recordVideo: {
              dir: videoDirectory,
              size: viewport
            }
          }
        : {})
    });
    const page = await context.newPage();
    video = page.video() ?? undefined;

    await page.goto(pathToFileURL(htmlPath).href, {
      waitUntil: "load",
      timeout: 30000
    });

    if (captureAtMs > 0) {
      await page.waitForTimeout(captureAtMs);
    }

    if (needsPreview) {
      await page.screenshot({
        path: previewPath,
        fullPage: false
      });
      console.log(`[capture] preview saved: ${previewPath}`);
    }

    const remainingMs = Math.max(0, options.videoDurationMs - captureAtMs);
    if (needsVideo && remainingMs > 0) {
      await page.waitForTimeout(remainingMs);
    }

    await context.close();
  } finally {
    await browser.close();
  }

  if (needsVideo && video) {
    const recordedVideoPath = await video.path();
    await rename(recordedVideoPath, videoPath);
    console.log(`[capture] webm saved: ${videoPath}`);
    await assertVideoHasVisibleFrames(videoPath);
    await rm(videoDirectory, { recursive: true, force: true });
    convertedMp4 = await convertWebmToMp4IfAvailable(videoPath, mp4Path);
    if (convertedMp4) {
      console.log(`[capture] mp4 saved: ${mp4Path}`);
    } else {
      console.warn("[capture] mp4 conversion skipped or failed; install ffmpeg for Safari-friendly MP4 output");
    }
  }

  const timestamp = options.now.toISOString();
  const nextRun = await writeUpdatedRunMetadata(run, {
    assets: {
      ...run.assets,
      html: htmlAsset,
      ...(needsPreview ? { preview: previewAsset } : {}),
      ...(needsVideo ? { video: videoAsset } : {}),
      ...(convertedMp4 ? { videoMp4: mp4Asset } : {})
    },
    capture: {
      ...run.capture,
      ...(needsPreview
        ? {
            preview: {
              status: "ready",
              path: previewAsset,
              capturedAt: timestamp
            } satisfies RunCaptureAsset
          }
        : {}),
      ...(needsVideo
        ? {
            video: {
              status: "ready",
              path: videoAsset,
              capturedAt: timestamp
            } satisfies RunCaptureAsset
          }
        : {})
    },
    updatedAt: timestamp
  });

  return {
    captured: true,
    run: nextRun
  };
}

async function markCaptureFailed(
  run: RunMetadata,
  error: unknown,
  now: Date
): Promise<void> {
  const timestamp = now.toISOString();
  const runError = toRunError(error);
  const preview = !run.assets?.preview
    ? {
        status: "failed" as const,
        path: DEFAULT_PREVIEW_ASSET,
        capturedAt: timestamp,
        error: runError
      }
    : run.capture?.preview;
  const video = !run.assets?.video
    ? {
        status: "failed" as const,
        path: DEFAULT_VIDEO_ASSET,
        capturedAt: timestamp,
        error: runError
      }
    : run.capture?.video;

  await writeUpdatedRunMetadata(run, {
    capture: {
      ...run.capture,
      ...(preview ? { preview } : {}),
      ...(video ? { video } : {})
    },
    updatedAt: timestamp
  });
}

async function writeUpdatedRunMetadata(
  run: RunMetadata,
  update: Partial<RunMetadata>
): Promise<RunMetadata> {
  const metadataAsset = run.assets?.metadata ?? "metadata.json";
  const metadataPath = join(run.runDirectory, metadataAsset);
  const current = JSON.parse(await readFile(metadataPath, "utf8")) as RunMetadata;
  const next: RunMetadata = {
    ...current,
    ...update,
    assets: {
      ...current.assets,
      ...update.assets,
      metadata: current.assets?.metadata ?? metadataAsset
    },
    capture: {
      ...current.capture,
      ...update.capture
    }
  };

  await writeFile(metadataPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export async function isVideoMostlyBlack(path: string): Promise<boolean | undefined> {
  try {
    const { stdout } = await execFileAsync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        path,
        "-vf",
        "fps=1,scale=4:4:flags=area,format=rgb24",
        "-frames:v",
        "3",
        "-f",
        "rawvideo",
        "pipe:1"
      ],
      {
        encoding: "buffer",
        maxBuffer: 1024 * 1024
      }
    );
    const bytes = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
    if (bytes.length === 0) {
      throw new Error("ffmpeg produced no sample frames.");
    }

    const maxChannel = Math.max(...bytes);
    const average = bytes.reduce((sum, value) => sum + value, 0) / bytes.length;
    return maxChannel < 12 && average < 6;
  } catch (error) {
    if (isMissingCommandError(error)) {
      return undefined;
    }

    throw error;
  }
}

async function assertVideoHasVisibleFrames(path: string): Promise<void> {
  const mostlyBlack = await isVideoMostlyBlack(path);
  if (mostlyBlack === undefined) {
    console.warn("[capture] video validation skipped; ffmpeg is not available");
    return;
  }

  if (mostlyBlack) {
    await rm(path, { force: true });
    throw new Error("Captured video appears to be black. The run was not marked video-ready.");
  }
}

async function convertWebmToMp4IfAvailable(
  inputPath: string,
  outputPath: string
): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-an",
      "-movflags",
      "+faststart",
      "-pix_fmt",
      "yuv420p",
      outputPath
    ]);
    return true;
  } catch {
    return false;
  }
}

async function assertFileExists(path: string): Promise<void> {
  const result = await stat(path);
  if (!result.isFile()) {
    throw new Error(`Expected file at ${path}.`);
  }
}

function isMissingCommandError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function toRunError(error: unknown) {
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
