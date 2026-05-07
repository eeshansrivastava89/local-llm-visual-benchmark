import { access, mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  captureRunPreview,
  DEFAULT_CAPTURE_SETTINGS,
  normalizeCaptureSettings
} from "../../src/runner/capture";
import { buildRunPaths } from "../../src/runner/paths";
import { writeRunHtml, writeRunMetadata } from "../../src/runner/runs";
import type { RunMetadata } from "../../src/runner/types";

async function createRunsRoot() {
  return mkdtemp(join(tmpdir(), "llm-visual-capture-"));
}

function createMetadata(runDirectory: string): RunMetadata {
  return {
    runId: "2026-05-06T01-02-03-004Z",
    benchmark: {
      id: "sakura",
      title: "Sakura Tree",
      description: "Dreamy cherry blossom animation.",
      prompt: "Animate a cherry blossom tree."
    },
    model: {
      id: "test-model",
      slug: "test-model"
    },
    status: "completed",
    createdAt: "2026-05-06T01:02:03.004Z",
    updatedAt: "2026-05-06T01:02:03.004Z",
    runDirectory,
    settings: DEFAULT_CAPTURE_SETTINGS,
    assets: {
      metadata: "metadata.json",
      rawResponse: "response.raw.txt",
      html: "index.html"
    }
  };
}

async function createRunWithMetadata() {
  const runsRoot = await createRunsRoot();
  const paths = buildRunPaths({
    runsRoot,
    benchmarkId: "sakura",
    modelId: "test-model",
    runId: "2026-05-06T01-02-03-004Z"
  });
  await writeRunMetadata(paths, createMetadata(paths.runDirectory));

  return paths;
}

describe("normalizeCaptureSettings", () => {
  it("uses 5s PNG capture defaults with video disabled", () => {
    expect(normalizeCaptureSettings()).toEqual({
      preview: {
        captureAtMs: 5000,
        viewport: {
          width: 1280,
          height: 720
        },
        video: false
      }
    });
  });

  it("merges provided preview settings without enabling video implicitly", () => {
    expect(
      normalizeCaptureSettings({
        preview: {
          captureAtMs: 250,
          viewport: {
            width: 640,
            height: 480
          }
        }
      })
    ).toEqual({
      preview: {
        captureAtMs: 250,
        viewport: {
          width: 640,
          height: 480
        },
        video: false
      }
    });
  });
});

describe("captureRunPreview", () => {
  it("writes preview.png from run HTML and records successful preview metadata", async () => {
    const paths = await createRunWithMetadata();
    await writeRunHtml(
      paths,
      "<!doctype html><html><body><main style=\"width:100vw;height:100vh;background:#123;color:white\">Preview</main></body></html>"
    );

    const metadata = await captureRunPreview(paths, {
      settings: {
        preview: {
          captureAtMs: 0,
          viewport: {
            width: 320,
            height: 180
          },
          video: false
        }
      },
      now: new Date("2026-05-06T01:02:08.004Z")
    });

    await expect(access(paths.previewPath)).resolves.toBeUndefined();
    await expect(stat(paths.previewPath)).resolves.toMatchObject({
      size: expect.any(Number)
    });
    expect(metadata).toMatchObject({
      updatedAt: "2026-05-06T01:02:08.004Z",
      assets: {
        preview: "preview.png"
      },
      capture: {
        preview: {
          status: "ready",
          path: "preview.png",
          capturedAt: "2026-05-06T01:02:08.004Z"
        },
        video: {
          status: "skipped",
          reason: "disabled"
        }
      }
    });
  });

  it("leaves video absent and records skipped video metadata when video is disabled", async () => {
    const paths = await createRunWithMetadata();
    await writeRunHtml(paths, "<!doctype html><html><body>Preview</body></html>");

    const metadata = await captureRunPreview(paths, {
      settings: {
        preview: {
          captureAtMs: 0,
          video: false
        }
      }
    });

    await expect(access(paths.videoPath)).rejects.toThrow();
    expect(metadata.assets.video).toBeUndefined();
    expect(metadata.capture?.video).toEqual({
      status: "skipped",
      reason: "disabled"
    });
  });

  it("records preview capture errors without deleting existing run output", async () => {
    const paths = await createRunWithMetadata();
    await writeRunHtml(paths, "<!doctype html><html><body>Raw HTML remains</body></html>");

    const metadata = await captureRunPreview(paths, {
      settings: {
        preview: {
          captureAtMs: 0
        }
      },
      htmlPath: join(paths.runDirectory, "missing.html"),
      now: new Date("2026-05-06T01:02:09.004Z")
    });

    await expect(readFile(paths.htmlPath, "utf8")).resolves.toContain(
      "Raw HTML remains"
    );
    expect(metadata.status).toBe("completed");
    expect(metadata.assets.preview).toBeUndefined();
    expect(metadata.capture?.preview?.status).toBe("failed");
    expect(metadata.capture?.preview?.error?.message).toContain("missing.html");
  });
});
