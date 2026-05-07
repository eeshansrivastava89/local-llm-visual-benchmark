import { join } from "node:path";
import { loadBenchmarks as defaultLoadBenchmarks } from "../runner/benchmarks";
import {
  checkLmStudioConnection as defaultCheckLmStudioConnection,
  listLmStudioModels as defaultListLmStudioModels,
  normalizeLmStudioBaseUrl
} from "../runner/lmstudio";
import { listRunMetadata as defaultListRunMetadata } from "../runner/runs";
import { getSystemStats as defaultGetSystemStats } from "../runner/system-stats";
import {
  BenchmarkQueue,
  expandQueueMatrix,
  type BenchmarkQueueDependencies,
  type QueueState
} from "../runner/queue";
import type { PartialCaptureSettings } from "../runner/capture";
import type {
  BenchmarkRecord,
  LMStudioModel,
  QueueJob,
  RunMetadata
} from "../runner/types";

const STATUS_TIMEOUT_MS = 2000;
const MODEL_LIST_TIMEOUT_MS = 10000;

export interface StatusRequest {
  baseUrl?: string;
}

export interface ModelsRequest {
  baseUrl?: string;
}

export interface StartQueueRequest {
  benchmarkIds: string[];
  modelIds: string[];
  repeatCount?: number;
  capture?: PartialCaptureSettings;
  baseUrl?: string;
}

export interface LocalApiDependencies {
  benchmarkDirectory?: string;
  runsRoot?: string;
  loadBenchmarks?: (benchmarkDirectory: string) => Promise<BenchmarkRecord[]>;
  checkLmStudioConnection?: typeof defaultCheckLmStudioConnection;
  listLmStudioModels?: typeof defaultListLmStudioModels;
  listRunMetadata?: (runsRoot?: string) => Promise<RunMetadata[]>;
  getSystemStats?: typeof defaultGetSystemStats;
  queueFactory?: QueueFactory;
}

export type QueueFactory = (
  jobs: QueueJob[],
  dependencies: BenchmarkQueueDependencies
) => QueueLike;

export interface QueueLike {
  getState(): QueueState;
  start(): Promise<QueueState>;
  stopAfterCurrent(): void;
  cancelNow(reason?: string): void;
}

export interface LocalApi {
  getStatus(request?: StatusRequest): Promise<StatusResponse>;
  getBenchmarks(): Promise<BenchmarksResponse>;
  getLmStudioModels(request?: ModelsRequest): Promise<ModelsResponse>;
  getSystemStats(): Promise<SystemStatsResponse>;
  getSavedRuns(): Promise<SavedRunsResponse>;
  startQueue(request: StartQueueRequest): Promise<QueueResponse>;
  stopAfterCurrent(): Promise<QueueResponse>;
  cancelNow(): Promise<QueueResponse>;
}

export interface StatusResponse {
  app: {
    status: "ok";
  };
  queue: QueueState;
  lmStudio: {
    baseUrl: string;
    connection: Awaited<ReturnType<typeof defaultCheckLmStudioConnection>>;
  };
}

export interface BenchmarksResponse {
  benchmarks: BenchmarkRecord[];
}

export interface ModelsResponse {
  baseUrl: string;
  models: LMStudioModel[];
}

export interface SystemStatsResponse {
  stats: ReturnType<typeof defaultGetSystemStats>;
}

export interface SavedRunsResponse {
  runs: RunMetadata[];
}

export interface QueueResponse {
  queue: QueueState;
}

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

class LocalQueueController {
  private activeQueue?: QueueLike;
  private activeRun?: Promise<QueueState>;

  constructor(
    private readonly options: {
      runsRoot?: string;
      queueFactory: QueueFactory;
    }
  ) {}

  getState(): QueueState {
    return this.activeQueue?.getState() ?? idleQueueState();
  }

  start(input: {
    jobs: QueueJob[];
    baseUrl?: string;
  }): QueueState {
    if (isQueueActive(this.activeQueue?.getState())) {
      throw new ApiRequestError(409, "A benchmark queue is already running.");
    }

    const queue = this.options.queueFactory(input.jobs, {
      runsRoot: this.options.runsRoot,
      lmStudioBaseUrl: normalizeLmStudioBaseUrl(input.baseUrl)
    });
    this.activeQueue = queue;
    this.activeRun = queue.start().catch(() => {
      // Keep route handlers responsive; job-level errors are persisted by the queue.
      return queue.getState();
    });
    void this.activeRun;

    return queue.getState();
  }

  stopAfterCurrent(): QueueState {
    this.activeQueue?.stopAfterCurrent();
    return this.getState();
  }

  cancelNow(): QueueState {
    this.activeQueue?.cancelNow();
    return this.getState();
  }
}

const defaultApi = createLocalApi();

export function createLocalApi(dependencies: LocalApiDependencies = {}): LocalApi {
  const benchmarkDirectory =
    dependencies.benchmarkDirectory ?? join(process.cwd(), "benchmarks");
  const runsRoot = dependencies.runsRoot ?? join(process.cwd(), "runs");
  const loadBenchmarks = dependencies.loadBenchmarks ?? defaultLoadBenchmarks;
  const checkLmStudioConnection =
    dependencies.checkLmStudioConnection ?? defaultCheckLmStudioConnection;
  const listLmStudioModels =
    dependencies.listLmStudioModels ?? defaultListLmStudioModels;
  const listRunMetadata = dependencies.listRunMetadata ?? defaultListRunMetadata;
  const getSystemStats = dependencies.getSystemStats ?? defaultGetSystemStats;
  const queueController = new LocalQueueController({
    runsRoot,
    queueFactory:
      dependencies.queueFactory ??
      ((jobs, queueDependencies) =>
        new BenchmarkQueue(jobs, queueDependencies))
  });

  return {
    async getStatus(request = {}) {
      const connection = await checkLmStudioConnection(request.baseUrl, {
        timeoutMs: STATUS_TIMEOUT_MS
      });

      return {
        app: {
          status: "ok"
        },
        queue: queueController.getState(),
        lmStudio: {
          baseUrl: connection.baseUrl,
          connection
        }
      };
    },

    async getBenchmarks() {
      return {
        benchmarks: await loadBenchmarks(benchmarkDirectory)
      };
    },

    async getLmStudioModels(request = {}) {
      return {
        baseUrl: normalizeLmStudioBaseUrl(request.baseUrl),
        models: await listLmStudioModels(request.baseUrl, {
          timeoutMs: MODEL_LIST_TIMEOUT_MS
        })
      };
    },

    async getSystemStats() {
      return {
        stats: getSystemStats()
      };
    },

    async getSavedRuns() {
      return {
        runs: await listRunMetadata(runsRoot)
      };
    },

    async startQueue(request) {
      const benchmarkIds = readStringArray(request.benchmarkIds, "benchmarkIds");
      const modelIds = readStringArray(request.modelIds, "modelIds");
      const benchmarks = selectBenchmarks(
        await loadBenchmarks(benchmarkDirectory),
        benchmarkIds
      );
      const models = modelIds.map((id) => ({ id }));
      const jobs = expandQueueMatrix({
        benchmarks,
        models,
        repeatCount: request.repeatCount ?? 1,
        settings: request.capture
      });

      return {
        queue: queueController.start({
          jobs,
          baseUrl: request.baseUrl
        })
      };
    },

    async stopAfterCurrent() {
      return {
        queue: queueController.stopAfterCurrent()
      };
    },

    async cancelNow() {
      return {
        queue: queueController.cancelNow()
      };
    }
  };
}

export async function apiJsonResponse<T>(
  operation: Promise<T> | T
): Promise<Response> {
  try {
    const body = await operation;

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    });
  } catch (error) {
    const status = error instanceof ApiRequestError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);

    return new Response(
      JSON.stringify({
        error: {
          message
        }
      }),
      {
        status,
        headers: {
          "content-type": "application/json"
        }
      }
    );
  }
}

export async function readJsonRequest(request: Request): Promise<unknown> {
  const text = await request.text();

  if (text.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ApiRequestError(400, "Request body must be valid JSON.");
  }
}

export function getDefaultLocalApi(): LocalApi {
  return defaultApi;
}

function selectBenchmarks(
  benchmarks: BenchmarkRecord[],
  requestedIds: string[]
): BenchmarkRecord[] {
  const byId = new Map(benchmarks.map((benchmark) => [benchmark.id, benchmark]));
  const selected = requestedIds.map((id) => byId.get(id));
  const missingIds = requestedIds.filter(
    (_id, index) => selected[index] === undefined
  );

  if (missingIds.length > 0) {
    throw new ApiRequestError(
      400,
      `Unknown benchmark IDs: ${missingIds.join(", ")}.`
    );
  }

  return selected as BenchmarkRecord[];
}

function readStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiRequestError(400, `${field} must be a non-empty string array.`);
  }

  const strings = value.map((item) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new ApiRequestError(400, `${field} must be a non-empty string array.`);
    }

    return item.trim();
  });

  return Array.from(new Set(strings));
}

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

function isQueueActive(state?: QueueState): boolean {
  return state?.status === "running" || state?.status === "stopping";
}
