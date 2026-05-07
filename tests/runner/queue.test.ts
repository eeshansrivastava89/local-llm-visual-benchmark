import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildRunPaths } from "../../src/runner/paths";
import {
  BenchmarkQueue,
  expandQueueMatrix,
  type QueueCapturePreview,
  type QueueRequestCompletion
} from "../../src/runner/queue";
import type { BenchmarkRecord, LMStudioModel, QueueJob } from "../../src/runner/types";

const HTML = "<!doctype html><html><head><title>Ok</title></head><body>Ok</body></html>";

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

const models: LMStudioModel[] = [{ id: "model-a" }, { id: "vendor/model:b" }];

async function createRunsRoot() {
  return mkdtemp(join(tmpdir(), "llm-visual-queue-"));
}

function createQueue(
  jobs: QueueJob[],
  options: {
    runsRoot: string;
    requestCompletion?: QueueRequestCompletion;
    capturePreview?: QueueCapturePreview;
  }
) {
  let nextRun = 0;

  return new BenchmarkQueue(jobs, {
    runsRoot: options.runsRoot,
    createRunId: () => `run-${++nextRun}`,
    now: () => new Date("2026-05-06T01:02:03.004Z"),
    requestCompletion:
      options.requestCompletion ??
      vi.fn(async () => HTML),
    capturePreview:
      options.capturePreview ??
      vi.fn(async () => undefined)
  });
}

function firstRunPaths(runsRoot: string, modelId = "model-a") {
  return buildRunPaths({
    runsRoot,
    benchmarkId: "sakura",
    modelId,
    runId: "run-1"
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe("expandQueueMatrix", () => {
  it("expands benchmarks x models x repeats in stable order with one-based repeat indexes", () => {
    const jobs = expandQueueMatrix({
      benchmarks,
      models,
      repeatCount: 2
    });

    expect(
      jobs.map((job) => ({
        id: job.id,
        benchmarkId: job.benchmark.id,
        modelId: job.model.id,
        repeatIndex: job.repeatIndex,
        repeatTotal: job.repeatTotal,
        status: job.status
      }))
    ).toEqual([
      {
        id: "sakura__model-a__repeat-1-of-2",
        benchmarkId: "sakura",
        modelId: "model-a",
        repeatIndex: 1,
        repeatTotal: 2,
        status: "queued"
      },
      {
        id: "sakura__model-a__repeat-2-of-2",
        benchmarkId: "sakura",
        modelId: "model-a",
        repeatIndex: 2,
        repeatTotal: 2,
        status: "queued"
      },
      {
        id: "sakura__vendor-model-b-3de925728e__repeat-1-of-2",
        benchmarkId: "sakura",
        modelId: "vendor/model:b",
        repeatIndex: 1,
        repeatTotal: 2,
        status: "queued"
      },
      {
        id: "sakura__vendor-model-b-3de925728e__repeat-2-of-2",
        benchmarkId: "sakura",
        modelId: "vendor/model:b",
        repeatIndex: 2,
        repeatTotal: 2,
        status: "queued"
      },
      {
        id: "solar-system__model-a__repeat-1-of-2",
        benchmarkId: "solar-system",
        modelId: "model-a",
        repeatIndex: 1,
        repeatTotal: 2,
        status: "queued"
      },
      {
        id: "solar-system__model-a__repeat-2-of-2",
        benchmarkId: "solar-system",
        modelId: "model-a",
        repeatIndex: 2,
        repeatTotal: 2,
        status: "queued"
      },
      {
        id: "solar-system__vendor-model-b-3de925728e__repeat-1-of-2",
        benchmarkId: "solar-system",
        modelId: "vendor/model:b",
        repeatIndex: 1,
        repeatTotal: 2,
        status: "queued"
      },
      {
        id: "solar-system__vendor-model-b-3de925728e__repeat-2-of-2",
        benchmarkId: "solar-system",
        modelId: "vendor/model:b",
        repeatIndex: 2,
        repeatTotal: 2,
        status: "queued"
      }
    ]);
  });
});

describe("BenchmarkQueue", () => {
  it("executes jobs sequentially through completion, extraction, and capture", async () => {
    const runsRoot = await createRunsRoot();
    const order: string[] = [];
    let activeSteps = 0;
    let maxActiveSteps = 0;
    const jobs = expandQueueMatrix({
      benchmarks: benchmarks.slice(0, 2),
      models: models.slice(0, 1),
      repeatCount: 1
    });

    const queue = createQueue(jobs, {
      runsRoot,
      requestCompletion: vi.fn(async ({ benchmark, model }) => {
        activeSteps += 1;
        maxActiveSteps = Math.max(maxActiveSteps, activeSteps);
        order.push(`request:${benchmark.id}:${model.id}`);
        await Promise.resolve();
        activeSteps -= 1;
        return HTML;
      }),
      capturePreview: vi.fn(async (_paths, { job }) => {
        activeSteps += 1;
        maxActiveSteps = Math.max(maxActiveSteps, activeSteps);
        order.push(`capture:${job.benchmark.id}:${job.model.id}`);
        await Promise.resolve();
        activeSteps -= 1;
      })
    });

    const state = await queue.start();

    expect(order).toEqual([
      "request:sakura:model-a",
      "capture:sakura:model-a",
      "request:solar-system:model-a",
      "capture:solar-system:model-a"
    ]);
    expect(maxActiveSteps).toBe(1);
    expect(state.completedJobs).toHaveLength(2);
    expect(state.failedJobs).toHaveLength(0);
  });

  it("writes completed metadata and run files for a successful job", async () => {
    const runsRoot = await createRunsRoot();
    const jobs = expandQueueMatrix({
      benchmarks: benchmarks.slice(0, 1),
      models: models.slice(0, 1),
      repeatCount: 1
    });
    const queue = createQueue(jobs, { runsRoot });

    await queue.start();

    const paths = firstRunPaths(runsRoot);
    const metadata = JSON.parse(await readFile(paths.metadataPath, "utf8"));
    await expect(readFile(paths.rawResponsePath, "utf8")).resolves.toBe(HTML);
    await expect(readFile(paths.htmlPath, "utf8")).resolves.toBe(HTML);
    expect(metadata).toMatchObject({
      status: "completed",
      completedAt: "2026-05-06T01:02:03.004Z",
      benchmark: {
        id: "sakura"
      },
      model: {
        id: "model-a",
        slug: "model-a"
      },
      assets: {
        rawResponse: "response.raw.txt",
        html: "index.html",
        preview: "preview.png"
      }
    });
  });

  it("emits terminal-friendly lifecycle log events", async () => {
    const runsRoot = await createRunsRoot();
    const logger = vi.fn();
    const jobs = expandQueueMatrix({
      benchmarks: benchmarks.slice(0, 1),
      models: models.slice(0, 1),
      repeatCount: 1
    });
    const queue = new BenchmarkQueue(jobs, {
      runsRoot,
      createRunId: () => "run-1",
      now: () => new Date("2026-05-06T01:02:03.004Z"),
      requestCompletion: vi.fn(async () => HTML),
      capturePreview: vi.fn(async () => undefined),
      logger
    });

    await queue.start();

    expect(logger).toHaveBeenCalledWith("queue:start", { totalJobs: 1 });
    expect(logger).toHaveBeenCalledWith(
      "job:start",
      expect.objectContaining({
        benchmarkId: "sakura",
        modelId: "model-a",
        repeat: "1/1"
      })
    );
    expect(logger).toHaveBeenCalledWith(
      "job:complete",
      expect.objectContaining({
        benchmarkId: "sakura",
        modelId: "model-a"
      })
    );
    expect(logger).toHaveBeenCalledWith(
      "queue:complete",
      expect.objectContaining({
        completedJobs: 1
      })
    );
  });

  it("records failed model or extraction metadata and continues to the next job", async () => {
    const runsRoot = await createRunsRoot();
    const jobs = expandQueueMatrix({
      benchmarks: benchmarks.slice(0, 2),
      models: models.slice(0, 1),
      repeatCount: 1
    });
    const queue = createQueue(jobs, {
      runsRoot,
      requestCompletion: vi
        .fn()
        .mockResolvedValueOnce("not html")
        .mockResolvedValueOnce(HTML)
    });

    const state = await queue.start();

    const failedPaths = firstRunPaths(runsRoot);
    const completedPaths = buildRunPaths({
      runsRoot,
      benchmarkId: "solar-system",
      modelId: "model-a",
      runId: "run-2"
    });
    const failedMetadata = JSON.parse(await readFile(failedPaths.metadataPath, "utf8"));
    const completedMetadata = JSON.parse(
      await readFile(completedPaths.metadataPath, "utf8")
    );

    expect(state.failedJobs).toHaveLength(1);
    expect(state.completedJobs).toHaveLength(1);
    expect(failedMetadata).toMatchObject({
      status: "failed",
      error: {
        message: expect.stringMatching(/no html document/i)
      }
    });
    await expect(readFile(failedPaths.rawResponsePath, "utf8")).resolves.toBe(
      "not html"
    );
    expect(completedMetadata.status).toBe("completed");
  });

  it("finishes the active job and skips remaining jobs after stopAfterCurrent", async () => {
    const runsRoot = await createRunsRoot();
    const gate = deferred<string>();
    const jobs = expandQueueMatrix({
      benchmarks: benchmarks.slice(0, 2),
      models: models.slice(0, 1),
      repeatCount: 1
    });
    const requestCompletion = vi.fn(async () => gate.promise);
    const queue = createQueue(jobs, {
      runsRoot,
      requestCompletion
    });

    const running = queue.start();
    await vi.waitFor(() => expect(queue.getState().activeJob?.id).toBe(jobs[0].id));

    queue.stopAfterCurrent();
    gate.resolve(HTML);

    const state = await running;

    expect(requestCompletion).toHaveBeenCalledTimes(1);
    expect(state.completedJobs.map((job) => job.id)).toEqual([jobs[0].id]);
    expect(state.skippedJobs.map((job) => job.id)).toEqual([jobs[1].id]);
    expect(state.pendingJobs).toHaveLength(0);
  });

  it("aborts the active job, marks its run cancelled, and stops on cancelNow", async () => {
    const runsRoot = await createRunsRoot();
    const jobs = expandQueueMatrix({
      benchmarks: benchmarks.slice(0, 2),
      models: models.slice(0, 1),
      repeatCount: 1
    });
    const requestCompletion = vi.fn(({ signal }) => {
      return new Promise<string>((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });
    const queue = createQueue(jobs, {
      runsRoot,
      requestCompletion
    });

    const running = queue.start();
    await vi.waitFor(() => expect(requestCompletion).toHaveBeenCalledTimes(1));

    queue.cancelNow();

    const state = await running;
    const metadata = JSON.parse(await readFile(firstRunPaths(runsRoot).metadataPath, "utf8"));

    expect(requestCompletion).toHaveBeenCalledTimes(1);
    expect(state.cancelledJob?.id).toBe(jobs[0].id);
    expect(state.completedJobs).toHaveLength(0);
    expect(state.failedJobs).toHaveLength(0);
    expect(state.pendingJobs.map((job) => job.id)).toEqual([jobs[1].id]);
    expect(metadata).toMatchObject({
      status: "cancelled",
      cancelledAt: "2026-05-06T01:02:03.004Z",
      error: {
        message: expect.stringMatching(/cancelled|aborted/i)
      }
    });
  });
});
