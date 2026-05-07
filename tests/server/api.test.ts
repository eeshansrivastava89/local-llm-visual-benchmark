import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createLocalApi } from "../../src/server/api";
import type { BenchmarkQueueDependencies, QueueState } from "../../src/runner/queue";
import type { BenchmarkRecord, LMStudioModel, QueueJob } from "../../src/runner/types";

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

function idleQueueState(): QueueState {
  return {
    status: "idle",
    pendingJobs: [],
    completedJobs: [],
    failedJobs: [],
    skippedJobs: [],
    totalJobs: 0
  };
}

class StubQueue {
  readonly jobs: QueueJob[];
  readonly dependencies: BenchmarkQueueDependencies;
  private state: QueueState;
  start = vi.fn(async () => this.state);
  stopAfterCurrent = vi.fn(() => {
    this.state = { ...this.state, status: "stopping" };
  });
  cancelNow = vi.fn(() => {
    this.state = { ...this.state, status: "cancelled" };
  });

  constructor(jobs: QueueJob[], dependencies: BenchmarkQueueDependencies) {
    this.jobs = jobs;
    this.dependencies = dependencies;
    this.state = {
      status: "running",
      activeJob: jobs[0],
      pendingJobs: jobs.slice(1),
      completedJobs: [],
      failedJobs: [],
      skippedJobs: [],
      totalJobs: jobs.length
    };
  }

  getState() {
    return this.state;
  }
}

describe("createLocalApi", () => {
  it("returns status with queue state and LM Studio connection shape", async () => {
    const checkLmStudioConnection = vi.fn(async () => ({
      ok: true,
      baseUrl: "http://example.test/v1"
    }));
    const api = createLocalApi({
      checkLmStudioConnection
    });

    await expect(api.getStatus({ baseUrl: "http://example.test" })).resolves.toEqual({
      app: {
        status: "ok"
      },
      queue: idleQueueState(),
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

  it("loads benchmark definitions through the runner loader", async () => {
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

  it("lists LM Studio models through the existing client", async () => {
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

  it("starts a singleton queue from requested benchmark IDs and model IDs", async () => {
    const queues: StubQueue[] = [];
    const api = createLocalApi({
      runsRoot: "/runs",
      loadBenchmarks: vi.fn(async () => benchmarks),
      queueFactory: (jobs, dependencies) => {
        const queue = new StubQueue(jobs, dependencies);
        queues.push(queue);
        return queue;
      }
    });

    const response = await api.startQueue({
      benchmarkIds: ["sakura"],
      modelIds: ["model-a", "model-b"],
      repeatCount: 2,
      capture: {
        preview: {
          captureAtMs: 1500,
          viewport: {
            width: 800,
            height: 600
          },
          video: true
        }
      },
      baseUrl: "http://localhost:1234"
    });

    expect(response.queue.status).toBe("running");
    expect(response.queue.totalJobs).toBe(4);
    expect(queues).toHaveLength(1);
    expect(queues[0].start).toHaveBeenCalledTimes(1);
    expect(queues[0].dependencies).toMatchObject({
      runsRoot: "/runs",
      lmStudioBaseUrl: "http://localhost:1234/v1"
    });
    expect(queues[0].jobs.map((job) => job.id)).toEqual([
      "sakura__model-a__repeat-1-of-2",
      "sakura__model-a__repeat-2-of-2",
      "sakura__model-b__repeat-1-of-2",
      "sakura__model-b__repeat-2-of-2"
    ]);
    expect(queues[0].jobs[0].settings.preview).toEqual({
      captureAtMs: 1500,
      viewport: {
        width: 800,
        height: 600
      },
      video: true
    });
  });

  it("delegates stop and cancel controls to the active singleton queue", async () => {
    const queues: StubQueue[] = [];
    const api = createLocalApi({
      loadBenchmarks: vi.fn(async () => benchmarks.slice(0, 1)),
      queueFactory: (jobs, dependencies) => {
        const queue = new StubQueue(jobs, dependencies);
        queues.push(queue);
        return queue;
      }
    });
    await api.startQueue({
      benchmarkIds: ["sakura"],
      modelIds: ["model-a"],
      repeatCount: 1
    });

    await expect(api.stopAfterCurrent()).resolves.toMatchObject({
      queue: {
        status: "stopping"
      }
    });
    await expect(api.cancelNow()).resolves.toMatchObject({
      queue: {
        status: "cancelled"
      }
    });
    expect(queues[0].stopAfterCurrent).toHaveBeenCalledTimes(1);
    expect(queues[0].cancelNow).toHaveBeenCalledTimes(1);
  });
});
