import { join } from "node:path";
import { loadBenchmarks as defaultLoadBenchmarks } from "../lib/benchmarks";
import {
  checkLmStudioConnection as defaultCheckLmStudioConnection,
  listLmStudioModels as defaultListLmStudioModels,
  normalizeLmStudioBaseUrl
} from "../lib/lmstudio";
import {
  getModelSyncState as defaultGetModelSyncState,
  mirrorModelsToConfigs as defaultMirrorModelsToConfigs,
  type ModelSyncState,
  type ModelSyncTarget
} from "../lib/model-sync";
import { prepareRun as defaultPrepareRun } from "../lib/prompt-prep";
import {
  deleteRunDirectory as defaultDeleteRunDirectory,
  listRunMetadata as defaultListRunMetadata
} from "../lib/runs";
import { getSystemStats as defaultGetSystemStats } from "../lib/system-stats";
import type { BenchmarkRecord, LMStudioModel, PreparedRun, RunMetadata } from "../lib/types";

const STATUS_TIMEOUT_MS = 2000;
const MODEL_LIST_TIMEOUT_MS = 10000;

export interface StatusRequest {
  baseUrl?: string;
}

export interface ModelsRequest {
  baseUrl?: string;
}

export interface PrepareRunRequest {
  benchmarkId?: string;
  modelId?: string;
}

export interface MirrorModelsRequest {
  baseUrl?: string;
  modelIds?: unknown;
  targets?: unknown;
}

export interface DeleteRunRequest {
  runDirectory?: string;
}

export interface LocalApiDependencies {
  benchmarkDirectory?: string;
  runsRoot?: string;
  enableModelSync?: boolean;
  enableWrites?: boolean;
  opencodePath?: string;
  piModelsPath?: string;
  loadBenchmarks?: (benchmarkDirectory: string) => Promise<BenchmarkRecord[]>;
  checkLmStudioConnection?: typeof defaultCheckLmStudioConnection;
  listLmStudioModels?: typeof defaultListLmStudioModels;
  listRunMetadata?: (runsRoot?: string) => Promise<RunMetadata[]>;
  deleteRunDirectory?: typeof defaultDeleteRunDirectory;
  getSystemStats?: typeof defaultGetSystemStats;
  prepareRun?: typeof defaultPrepareRun;
  getModelSyncState?: typeof defaultGetModelSyncState;
  mirrorModelsToConfigs?: typeof defaultMirrorModelsToConfigs;
}

export interface LocalApi {
  getStatus(request?: StatusRequest): Promise<StatusResponse>;
  getBenchmarks(): Promise<BenchmarksResponse>;
  getLmStudioModels(request?: ModelsRequest): Promise<ModelsResponse>;
  getSystemStats(): Promise<SystemStatsResponse>;
  getSavedRuns(): Promise<SavedRunsResponse>;
  deleteSavedRun(request: DeleteRunRequest): Promise<DeleteRunResponse>;
  prepareRun(request: PrepareRunRequest): Promise<PrepareRunResponse>;
  getModelSyncState(): Promise<ModelSyncStateResponse>;
  mirrorModels(request: MirrorModelsRequest): Promise<MirrorModelsResponse>;
}

export interface StatusResponse {
  app: {
    status: "ok";
    writesEnabled: boolean;
  };
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

export interface PrepareRunResponse {
  preparedRun: PreparedRun;
}

export interface DeleteRunResponse {
  deleted: true;
  runDirectory: string;
}

export interface ModelSyncStateResponse {
  sync: ModelSyncState;
}

export interface MirrorModelsResponse {
  updated: ModelSyncTarget[];
  mirroredModelCount: number;
  sync: ModelSyncState;
}

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

const defaultApi = createLocalApi();

export function createLocalApi(dependencies: LocalApiDependencies = {}): LocalApi {
  const benchmarkDirectory =
    dependencies.benchmarkDirectory ?? join(process.cwd(), "benchmarks");
  const runsRoot = dependencies.runsRoot ?? join(process.cwd(), "runs");
  const isDevMode = process.env.NODE_ENV !== "production";
  const enableModelSync = dependencies.enableModelSync ?? isDevMode;
  const enableWrites = dependencies.enableWrites ?? isDevMode;
  const opencodePath = dependencies.opencodePath;
  const piModelsPath = dependencies.piModelsPath;
  const loadBenchmarks = dependencies.loadBenchmarks ?? defaultLoadBenchmarks;
  const checkLmStudioConnection =
    dependencies.checkLmStudioConnection ?? defaultCheckLmStudioConnection;
  const listLmStudioModels =
    dependencies.listLmStudioModels ?? defaultListLmStudioModels;
  const listRunMetadata = dependencies.listRunMetadata ?? defaultListRunMetadata;
  const deleteRunDirectory = dependencies.deleteRunDirectory ?? defaultDeleteRunDirectory;
  const getSystemStats = dependencies.getSystemStats ?? defaultGetSystemStats;
  const prepareRun = dependencies.prepareRun ?? defaultPrepareRun;
  const getModelSyncState = dependencies.getModelSyncState ?? defaultGetModelSyncState;
  const mirrorModelsToConfigs =
    dependencies.mirrorModelsToConfigs ?? defaultMirrorModelsToConfigs;

  return {
    async getStatus(request = {}) {
      const connection = await checkLmStudioConnection(request.baseUrl, {
        timeoutMs: STATUS_TIMEOUT_MS
      });

      return {
        app: {
          status: "ok",
          writesEnabled: enableWrites
        },
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

    async deleteSavedRun(request) {
      assertWritesEnabled(enableWrites);
      const runDirectory = readRequiredString(request.runDirectory, "runDirectory");
      await deleteRunDirectory({ runsRoot, runDirectory });

      return {
        deleted: true,
        runDirectory
      };
    },

    async prepareRun(request) {
      assertWritesEnabled(enableWrites);
      const benchmarkId = readRequiredString(request.benchmarkId, "benchmarkId");
      const modelId = readRequiredString(request.modelId, "modelId");
      const benchmark = selectBenchmark(
        await loadBenchmarks(benchmarkDirectory),
        benchmarkId
      );

      return {
        preparedRun: await prepareRun({
          benchmark,
          modelId,
          runsRoot
        })
      };
    },

    async getModelSyncState() {
      return {
        sync: await getModelSyncState({
          enabled: enableModelSync,
          opencodePath,
          piPath: piModelsPath
        })
      };
    },

    async mirrorModels(request) {
      const modelIds = readStringArray(request.modelIds, "modelIds");
      const targets = readModelSyncTargets(request.targets);

      const result = await mirrorModelsToConfigs(
        {
          baseUrl: request.baseUrl,
          modelIds,
          targets
        },
        {
          enabled: enableModelSync,
          opencodePath,
          piPath: piModelsPath
        }
      );

      return {
        updated: result.updated,
        mirroredModelCount: result.mirroredModelCount,
        sync: result.state
      };
    }
  };
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type"
};

export async function apiJsonResponse<T>(
  operation: Promise<T> | T
): Promise<Response> {
  try {
    const body = await operation;

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        "content-type": "application/json",
        ...CORS_HEADERS
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
          "content-type": "application/json",
          ...CORS_HEADERS
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

function assertWritesEnabled(enableWrites: boolean): void {
  if (!enableWrites) {
    throw new ApiRequestError(403, "Write actions are only available in dev server mode.");
  }
}

function selectBenchmark(
  benchmarks: BenchmarkRecord[],
  requestedId: string
): BenchmarkRecord {
  const byId = new Map(benchmarks.map((benchmark) => [benchmark.id, benchmark]));
  const selected = byId.get(requestedId);

  if (!selected) {
    throw new ApiRequestError(400, `Unknown benchmark ID: ${requestedId}.`);
  }

  return selected;
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiRequestError(400, `${field} must be a non-empty string.`);
  }

  return value.trim();
}

function readStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new ApiRequestError(400, `${field} must be a string array.`);
  }

  const result = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);

  if (result.length === 0) {
    throw new ApiRequestError(400, `${field} must contain at least one item.`);
  }

  return result;
}

function readModelSyncTargets(value: unknown): ModelSyncTarget[] {
  const targets = value ?? ["opencode", "pi"];
  if (!Array.isArray(targets)) {
    throw new ApiRequestError(400, "targets must be an array.");
  }

  const normalized = Array.from(
    new Set(
      targets
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item): item is ModelSyncTarget => item === "opencode" || item === "pi")
    )
  );

  if (normalized.length === 0) {
    throw new ApiRequestError(400, "targets must include pi, opencode, or both.");
  }

  return normalized;
}
