import { mkdtemp, mkdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { assertTrustedWriteRequest, createLocalApi } from "../../src/server/api";
import type { BenchmarkRecord, LMStudioModel, PreparedRun, RunMetadata } from "../../src/lib/types";
import type { MirrorModelsResult } from "../../src/lib/model-sync";

const benchmarks: BenchmarkRecord[] = [
  {
    id: "sakura",
    title: "Sakura",
    description: "Cherry blossom animation.",
    prompt: "Draw sakura."
  },
  {
    id: "solar-system",
    title: "Solar System",
    description: "Orbital animation.",
    prompt: "Draw planets."
  }
];

const models: LMStudioModel[] = [{ id: "model-a" }, { id: "model-b" }];

describe("createLocalApi", () => {
  it("returns status with passive LM Studio connection shape", async () => {
    const checkLmStudioConnection = vi.fn(async () => ({
      ok: true,
      baseUrl: "http://example.test/v1"
    }));
    const api = createLocalApi({
      checkLmStudioConnection
    });

    await expect(api.getStatus({ baseUrl: "http://example.test" })).resolves.toEqual({
      app: {
        status: "ok",
        writesEnabled: true
      },
      lmStudio: {
        baseUrl: "http://example.test/v1",
        connection: {
          ok: true,
          baseUrl: "http://example.test/v1"
        }
      }
    });
    expect(checkLmStudioConnection).toHaveBeenCalledWith("http://example.test", {
      timeoutMs: 2000
    });
  });

  it("loads benchmark definitions through the benchmark loader", async () => {
    const loadBenchmarks = vi.fn(async () => benchmarks);
    const api = createLocalApi({
      benchmarkDirectory: "/benchmarks",
      loadBenchmarks
    });

    await expect(api.getBenchmarks()).resolves.toEqual({
      benchmarks
    });
    expect(loadBenchmarks).toHaveBeenCalledWith("/benchmarks");
  });

  it("lists LM Studio models through the passive client", async () => {
    const listLmStudioModels = vi.fn(async () => models);
    const api = createLocalApi({
      listLmStudioModels
    });

    await expect(api.getLmStudioModels({ baseUrl: "http://localhost:1234" })).resolves.toEqual({
      baseUrl: "http://localhost:1234/v1",
      models
    });
    expect(listLmStudioModels).toHaveBeenCalledWith("http://localhost:1234", {
      timeoutMs: 10000
    });
  });

  it("returns an empty saved run list when the runs directory is missing", async () => {
    const api = createLocalApi({
      runsRoot: join(tmpdir(), "missing-local-visual-runs")
    });

    await expect(api.getSavedRuns()).resolves.toEqual({
      runs: []
    });
  });

  it("lists saved run metadata newest first", async () => {
    const runsRoot = await mkdtemp(join(tmpdir(), "local-visual-runs-"));
    const older = join(runsRoot, "sakura", "model-a", "run-old");
    const newer = join(runsRoot, "sakura", "model-b", "run-new");
    await mkdir(older, { recursive: true });
    await mkdir(newer, { recursive: true });
    await writeFile(
      join(older, "metadata.json"),
      JSON.stringify({
        runId: "run-old",
        createdAt: "2026-05-06T01:00:00.000Z",
        updatedAt: "2026-05-06T01:00:00.000Z",
        status: "completed"
      })
    );
    await writeFile(
      join(newer, "metadata.json"),
      JSON.stringify({
        runId: "run-new",
        createdAt: "2026-05-06T02:00:00.000Z",
        updatedAt: "2026-05-06T02:00:00.000Z",
        status: "failed"
      })
    );
    const api = createLocalApi({ runsRoot });

    const response = await api.getSavedRuns();

    expect(response.runs.map((run) => run.runId)).toEqual(["run-new", "run-old"]);
  });

  it("prepares a run slot from a benchmark and model ID", async () => {
    const preparedRun: PreparedRun = {
      run: {
        runId: "run-1",
        benchmark: benchmarks[0],
        model: {
          id: "model-a",
          slug: "model-a"
        },
        status: "prepared",
        createdAt: "2026-05-07T00:00:00.000Z",
        updatedAt: "2026-05-07T00:00:00.000Z",
        preparedAt: "2026-05-07T00:00:00.000Z",
        runDirectory: "/runs/sakura/model-a/run-1",
        assets: {
          metadata: "metadata.json",
          prompt: "prompt.md",
          html: "index.html",
          preview: "preview.png"
        }
      },
      prompt: "prompt",
      paths: {
        runDirectory: "/runs/sakura/model-a/run-1",
        promptPath: "/runs/sakura/model-a/run-1/prompt.md",
        htmlPath: "/runs/sakura/model-a/run-1/index.html",
        metadataPath: "/runs/sakura/model-a/run-1/metadata.json",
        previewPath: "/runs/sakura/model-a/run-1/preview.png"
      }
    };
    const prepareRun = vi.fn(async () => preparedRun);
    const api = createLocalApi({
      runsRoot: "/runs",
      loadBenchmarks: vi.fn(async () => benchmarks),
      prepareRun
    });

    await expect(
      api.prepareRun({
        benchmarkId: "sakura",
        modelId: "model-a"
      })
    ).resolves.toEqual({
      preparedRun
    });
    expect(prepareRun).toHaveBeenCalledWith({
      benchmark: benchmarks[0],
      modelId: "model-a",
      runsRoot: "/runs"
    });
  });

  it("captures missing run media through the configured dependency", async () => {
    const runs: RunMetadata[] = [];
    const captureMissingRunMedia = vi.fn(async () => ({
      captured: 2,
      skipped: 1,
      failed: 0,
      runs
    }));
    const api = createLocalApi({
      runsRoot: "/runs",
      captureMissingRunMedia
    });

    await expect(api.captureMissingMedia({})).resolves.toEqual({
      captured: 2,
      skipped: 1,
      failed: 0,
      runs
    });
    expect(captureMissingRunMedia).toHaveBeenCalledWith({ runsRoot: "/runs" });
  });

  it("captures one requested run when a run directory is provided", async () => {
    const runs: RunMetadata[] = [];
    const captureSingleRunMedia = vi.fn(async () => ({
      captured: 1,
      skipped: 0,
      failed: 0,
      runs
    }));
    const api = createLocalApi({
      runsRoot: "/runs",
      captureSingleRunMedia
    });

    await expect(
      api.captureMissingMedia({ runDirectory: "/runs/sakura/model-a/run-1" })
    ).resolves.toEqual({
      captured: 1,
      skipped: 0,
      failed: 0,
      runs
    });
    expect(captureSingleRunMedia).toHaveBeenCalledWith({
      runsRoot: "/runs",
      runDirectory: "/runs/sakura/model-a/run-1",
      force: false
    });
  });

  it("forwards forced recapture only for one requested run", async () => {
    const runs: RunMetadata[] = [];
    const captureSingleRunMedia = vi.fn(async () => ({
      captured: 1,
      skipped: 0,
      failed: 0,
      runs
    }));
    const captureMissingRunMedia = vi.fn();
    const api = createLocalApi({
      runsRoot: "/runs",
      captureSingleRunMedia,
      captureMissingRunMedia
    });

    await expect(
      api.captureMissingMedia({
        runDirectory: "/runs/sakura/model-a/run-1",
        force: true
      })
    ).resolves.toMatchObject({
      captured: 1,
      skipped: 0,
      failed: 0
    });
    expect(captureSingleRunMedia).toHaveBeenCalledWith({
      runsRoot: "/runs",
      runDirectory: "/runs/sakura/model-a/run-1",
      force: true
    });
    expect(captureMissingRunMedia).not.toHaveBeenCalled();
  });

  it("rejects forced bulk capture", async () => {
    const api = createLocalApi();

    await expect(api.captureMissingMedia({ force: true })).rejects.toThrow(
      /force recapture requires a runDirectory/
    );
  });

  it("rejects capture when writes are disabled", async () => {
    const api = createLocalApi({ enableWrites: false });

    await expect(api.captureMissingMedia({})).rejects.toThrow(
      /Write actions are only available in dev server mode/
    );
  });

  it("deletes a saved run folder from the configured runs root", async () => {
    const runsRoot = await mkdtemp(join(tmpdir(), "local-visual-runs-delete-"));
    const runDirectory = join(runsRoot, "sakura", "model-a", "run-1");
    await mkdir(runDirectory, { recursive: true });
    await writeFile(join(runDirectory, "metadata.json"), "{}", "utf8");
    const api = createLocalApi({ runsRoot });

    await expect(api.deleteSavedRun({ runDirectory })).resolves.toEqual({
      deleted: true,
      runDirectory
    });
    await expect(stat(runDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects preparing run slots when writes are disabled", async () => {
    const api = createLocalApi({
      enableWrites: false,
      loadBenchmarks: vi.fn(async () => benchmarks)
    });

    await expect(
      api.prepareRun({
        benchmarkId: "sakura",
        modelId: "model-a"
      })
    ).rejects.toThrow(/Write actions are only available in dev server mode/);
  });

  it("rejects deleting saved runs when writes are disabled", async () => {
    const api = createLocalApi({ enableWrites: false });

    await expect(
      api.deleteSavedRun({ runDirectory: "/runs/sakura/model-a/run-1" })
    ).rejects.toThrow(/Write actions are only available in dev server mode/);
  });

  it("opens generated HTML from an absolute run path", async () => {
    const runsRoot = await mkdtemp(join(tmpdir(), "local-visual-runs-open-"));
    const runDirectory = join(runsRoot, "sakura", "model-a", "run-1");
    const htmlPath = join(runDirectory, "index.html");
    const openFile = vi.fn(async () => {});
    await mkdir(runDirectory, { recursive: true });
    await writeFile(htmlPath, "<!doctype html>", "utf8");
    const api = createLocalApi({ runsRoot, openFile });

    await expect(
      api.openRunHtml({ runDirectory, asset: "index.html" })
    ).resolves.toEqual({
      opened: true,
      path: htmlPath
    });
    expect(openFile).toHaveBeenCalledWith(htmlPath);
  });

  it("rejects opening generated HTML when writes are disabled", async () => {
    const api = createLocalApi({ enableWrites: false });

    await expect(
      api.openRunHtml({ runDirectory: "/runs/sakura/model-a/run-1", asset: "index.html" })
    ).rejects.toThrow(/Write actions are only available in dev server mode/);
  });

  it("rejects opening non-HTML run assets", async () => {
    const runsRoot = await mkdtemp(join(tmpdir(), "local-visual-runs-open-"));
    const runDirectory = join(runsRoot, "sakura", "model-a", "run-1");
    await mkdir(runDirectory, { recursive: true });
    await writeFile(join(runDirectory, "preview.png"), "png", "utf8");
    const api = createLocalApi({
      runsRoot,
      openFile: vi.fn(async () => {})
    });

    await expect(
      api.openRunHtml({ runDirectory, asset: "preview.png" })
    ).rejects.toThrow(/Only generated HTML files can be opened/);
  });

  it("rejects unknown benchmark IDs while preparing a run", async () => {
    const api = createLocalApi({
      loadBenchmarks: vi.fn(async () => benchmarks)
    });

    await expect(
      api.prepareRun({
        benchmarkId: "missing",
        modelId: "model-a"
      })
    ).rejects.toThrow(/Unknown benchmark ID: missing/);
  });

  it("returns model sync state from the configured dependency", async () => {
    const getModelSyncState = vi.fn(async () => ({
      enabled: true,
      paths: {
        opencode: "/tmp/opencode.json",
        pi: "/tmp/models.json"
      },
      files: {
        opencode: { exists: true, modelIds: ["model-a"] },
        pi: { exists: false, modelIds: [] }
      }
    }));
    const api = createLocalApi({
      getModelSyncState
    });

    await expect(api.getModelSyncState()).resolves.toEqual({
      sync: {
        enabled: true,
        paths: {
          opencode: "/tmp/opencode.json",
          pi: "/tmp/models.json"
        },
        files: {
          opencode: { exists: true, modelIds: ["model-a"] },
          pi: { exists: false, modelIds: [] }
        }
      }
    });
  });

  it("mirrors models through the model-sync dependency", async () => {
    const mirrorModelsToConfigs = vi.fn(async (): Promise<MirrorModelsResult> => ({
      updated: ["opencode", "pi"],
      mirroredModelCount: 2,
      state: {
        enabled: true,
        paths: {
          opencode: "/tmp/opencode.json",
          pi: "/tmp/models.json"
        },
        files: {
          opencode: { exists: true, modelIds: ["model-a", "model-b"] },
          pi: { exists: true, modelIds: ["model-a", "model-b"] }
        }
      }
    }));
    const api = createLocalApi({
      mirrorModelsToConfigs
    });

    await expect(
      api.mirrorModels({
        baseUrl: "http://localhost:1234",
        modelIds: ["model-a", "model-b"],
        targets: ["opencode", "pi"]
      })
    ).resolves.toEqual({
      updated: ["opencode", "pi"],
      mirroredModelCount: 2,
      sync: {
        enabled: true,
        paths: {
          opencode: "/tmp/opencode.json",
          pi: "/tmp/models.json"
        },
        files: {
          opencode: { exists: true, modelIds: ["model-a", "model-b"] },
          pi: { exists: true, modelIds: ["model-a", "model-b"] }
        }
      }
    });

    expect(mirrorModelsToConfigs).toHaveBeenCalledWith(
      {
        baseUrl: "http://localhost:1234",
        modelIds: ["model-a", "model-b"],
        targets: ["opencode", "pi"]
      },
      {
        enabled: true,
        opencodePath: undefined,
        piPath: undefined
      }
    );
  });
});

describe("assertTrustedWriteRequest", () => {
  it("allows same-origin browser write requests", () => {
    const request = new Request("http://localhost:4321/api/prepare-run", {
      method: "POST",
      headers: {
        origin: "http://localhost:4321",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json"
      },
      body: "{}"
    });

    expect(() => assertTrustedWriteRequest(request)).not.toThrow();
  });

  it("rejects cross-origin browser write requests", () => {
    const request = new Request("http://localhost:4321/api/prepare-run", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site",
        "content-type": "application/json"
      },
      body: "{}"
    });

    expect(() => assertTrustedWriteRequest(request)).toThrow(
      /Write requests must come from the local app origin/
    );
  });

  it("rejects write requests without JSON content type", () => {
    const request = new Request("http://localhost:4321/api/prepare-run", {
      method: "POST",
      headers: {
        origin: "http://localhost:4321",
        "content-type": "text/plain"
      },
      body: "{}"
    });

    expect(() => assertTrustedWriteRequest(request)).toThrow(
      /Write requests must use application\/json/
    );
  });
});
