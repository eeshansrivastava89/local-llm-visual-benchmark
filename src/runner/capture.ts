import { access, copyFile } from "node:fs/promises";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { readRunMetadata, updateRunMetadata } from "./runs";
import type {
  CaptureSettings,
  PreviewSettings,
  RunCaptureAsset,
  RunError,
  RunMetadata,
  ViewportSettings
} from "./types";
import type { RunPaths } from "./paths";

export const DEFAULT_CAPTURE_SETTINGS: CaptureSettings = {
  preview: {
    captureAtMs: 5000,
    viewport: {
      width: 1280,
      height: 720
    },
    video: false
  }
};

export interface PartialPreviewSettings {
  captureAtMs?: number;
  viewport?: Partial<ViewportSettings>;
  video?: boolean;
}

export interface PartialCaptureSettings {
  preview?: PartialPreviewSettings;
}

export interface CaptureRunPreviewOptions {
  settings?: PartialCaptureSettings;
  htmlPath?: string;
  now?: Date;
}

export function normalizeCaptureSettings(
  settings: PartialCaptureSettings = {}
): CaptureSettings {
  const preview = settings.preview ?? {};

  return {
    preview: {
      captureAtMs:
        preview.captureAtMs ?? DEFAULT_CAPTURE_SETTINGS.preview.captureAtMs,
      viewport: {
        width:
          preview.viewport?.width ??
          DEFAULT_CAPTURE_SETTINGS.preview.viewport.width,
        height:
          preview.viewport?.height ??
          DEFAULT_CAPTURE_SETTINGS.preview.viewport.height
      },
      video: preview.video ?? DEFAULT_CAPTURE_SETTINGS.preview.video
    }
  };
}

export async function captureRunPreview(
  paths: RunPaths,
  options: CaptureRunPreviewOptions = {}
): Promise<RunMetadata> {
  const current = await readRunMetadata(paths);
  const settings = normalizeCaptureSettings(options.settings ?? current.settings);
  const htmlPath = options.htmlPath ?? paths.htmlPath;
  const timestamp = (options.now ?? new Date()).toISOString();

  try {
    await access(htmlPath);
    const videoResult = await captureWithPlaywright(paths, htmlPath, settings.preview);

    return updateRunMetadata(paths, {
      updatedAt: timestamp,
      settings,
      assets: {
        ...current.assets,
        preview: basename(paths.previewPath),
        ...(videoResult.path ? { video: videoResult.path } : {})
      },
      capture: {
        ...current.capture,
        preview: {
          status: "ready",
          path: basename(paths.previewPath),
          capturedAt: timestamp
        },
        video: videoResult
      }
    });
  } catch (error) {
    return updateRunMetadata(paths, {
      updatedAt: timestamp,
      settings,
      assets: {
        ...current.assets
      },
      capture: {
        ...current.capture,
        preview: {
          status: "failed",
          error: toRunError(error)
        },
        video: videoSkipped(settings.preview)
      }
    });
  }
}

async function captureWithPlaywright(
  paths: RunPaths,
  htmlPath: string,
  settings: PreviewSettings
): Promise<RunCaptureAsset> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: settings.viewport,
    ...(settings.video
      ? {
          recordVideo: {
            dir: paths.runDirectory,
            size: settings.viewport
          }
        }
      : {})
  });
  const page = await context.newPage();

  try {
    await page.goto(pathToFileURL(htmlPath).href, {
      waitUntil: "load"
    });
    if (settings.captureAtMs > 0) {
      await page.waitForTimeout(settings.captureAtMs);
    }
    await page.screenshot({
      path: paths.previewPath,
      fullPage: false
    });

    const video = page.video();
    await context.close();
    await browser.close();

    if (!settings.video || !video) {
      return videoSkipped(settings);
    }

    const videoPath = await video.path();
    await copyFile(videoPath, paths.videoPath);

    return {
      status: "ready",
      path: basename(paths.videoPath)
    };
  } catch (error) {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    throw error;
  }
}

function videoSkipped(settings: PreviewSettings): {
  status: "skipped";
  reason: string;
} {
  return {
    status: "skipped",
    reason: settings.video ? "not_captured" : "disabled"
  };
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
