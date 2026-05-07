import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildRunPaths } from "../../src/runner/paths";
import {
  markRunFailed,
  updateRunMetadata,
  writeRawResponse,
  writeRunHtml,
  writeRunMetadata
} from "../../src/runner/runs";
import type { RunMetadata } from "../../src/runner/types";

async function createRunsRoot() {
  return mkdtemp(join(tmpdir(), "llm-visual-runs-"));
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
      id: "lmstudio-community/Qwen2.5 Coder:7B Instruct",
      slug: "lmstudio-community-qwen2-5-coder-7b-instruct-1234567890"
    },
    status: "queued",
    createdAt: "2026-05-06T01:02:03.004Z",
    updatedAt: "2026-05-06T01:02:03.004Z",
    runDirectory,
    settings: {
      preview: {
        captureAtMs: 5000,
        viewport: {
          width: 1280,
          height: 720
        },
        video: false
      }
    },
    assets: {
      metadata: "metadata.json",
      rawResponse: "response.raw.txt",
      html: "index.html",
      preview: "preview.png"
    }
  };
}

describe("run metadata helpers", () => {
  it("creates directories and writes stable pretty JSON metadata", async () => {
    const runsRoot = await createRunsRoot();
    const paths = buildRunPaths({
      runsRoot,
      benchmarkId: "sakura",
      modelId: "lmstudio-community/Qwen2.5 Coder:7B Instruct",
      runId: "2026-05-06T01-02-03-004Z"
    });
    const metadata = createMetadata(paths.runDirectory);

    await writeRunMetadata(paths, metadata);

    const raw = await readFile(paths.metadataPath, "utf8");
    expect(raw).toBe(`${JSON.stringify(metadata, null, 2)}\n`);
    expect(JSON.parse(raw)).toMatchObject({
      model: {
        id: "lmstudio-community/Qwen2.5 Coder:7B Instruct"
      },
      status: "queued"
    });
  });

  it("updates metadata status without losing existing model identity", async () => {
    const runsRoot = await createRunsRoot();
    const paths = buildRunPaths({
      runsRoot,
      benchmarkId: "sakura",
      modelId: "lmstudio-community/Qwen2.5 Coder:7B Instruct",
      runId: "2026-05-06T01-02-03-004Z"
    });
    const metadata = createMetadata(paths.runDirectory);

    await writeRunMetadata(paths, metadata);
    const updated = await updateRunMetadata(paths, {
      status: "running",
      updatedAt: "2026-05-06T01:02:05.004Z"
    });

    expect(updated.status).toBe("running");
    expect(updated.model.id).toBe("lmstudio-community/Qwen2.5 Coder:7B Instruct");
    expect(updated.updatedAt).toBe("2026-05-06T01:02:05.004Z");

    const saved = JSON.parse(await readFile(paths.metadataPath, "utf8"));
    expect(saved).toMatchObject({
      status: "running",
      model: {
        id: "lmstudio-community/Qwen2.5 Coder:7B Instruct"
      }
    });
  });

  it("writes raw model responses to the run raw response path", async () => {
    const runsRoot = await createRunsRoot();
    const paths = buildRunPaths({
      runsRoot,
      benchmarkId: "sakura",
      modelId: "lmstudio-community/Qwen2.5 Coder:7B Instruct",
      runId: "2026-05-06T01-02-03-004Z"
    });

    await writeRawResponse(paths, "raw response text");

    await expect(readFile(paths.rawResponsePath, "utf8")).resolves.toBe(
      "raw response text"
    );
  });

  it("writes extracted HTML to the run index path", async () => {
    const runsRoot = await createRunsRoot();
    const paths = buildRunPaths({
      runsRoot,
      benchmarkId: "sakura",
      modelId: "lmstudio-community/Qwen2.5 Coder:7B Instruct",
      runId: "2026-05-06T01-02-03-004Z"
    });
    const html = "<!doctype html><html><head></head><body></body></html>";

    await writeRunHtml(paths, html);

    await expect(readFile(paths.htmlPath, "utf8")).resolves.toBe(html);
  });

  it("marks failed metadata with error details while preserving model identity", async () => {
    const runsRoot = await createRunsRoot();
    const paths = buildRunPaths({
      runsRoot,
      benchmarkId: "sakura",
      modelId: "lmstudio-community/Qwen2.5 Coder:7B Instruct",
      runId: "2026-05-06T01-02-03-004Z"
    });
    const metadata = createMetadata(paths.runDirectory);

    await writeRunMetadata(paths, metadata);
    const updated = await markRunFailed(
      paths,
      new Error("HTML extraction failed"),
      new Date("2026-05-06T01:02:05.004Z")
    );

    expect(updated).toMatchObject({
      status: "failed",
      updatedAt: "2026-05-06T01:02:05.004Z",
      failedAt: "2026-05-06T01:02:05.004Z",
      model: {
        id: "lmstudio-community/Qwen2.5 Coder:7B Instruct"
      },
      error: {
        message: "HTML extraction failed"
      }
    });
  });
});
