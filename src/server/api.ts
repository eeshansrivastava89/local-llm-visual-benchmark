import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  captureMissingRunMedia as defaultCaptureMissingRunMedia,
  captureSingleRunMedia as defaultCaptureSingleRunMedia,
  type CaptureMissingRunMediaResult
} from "../lib/capture-media";
import { assertSafeRunAssetPath, isPathInside, resolveRunAssetPath } from "../lib/asset-paths";
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
const execFileAsync = promisify(execFile);

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

export interface CaptureMediaRequest {
  runDirectory?: string;
  force?: unknown;
}

export interface OpenRunHtmlRequest {
  runDirectory?: string;
  asset?: string;
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
  captureMissingRunMedia?: typeof defaultCaptureMissingRunMedia;
  captureSingleRunMedia?: typeof defaultCaptureSingleRunMedia;
  openFile?: (path: string) => Promise<void>;
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
  captureMissingMedia(request?: CaptureMediaRequest): Promise<CaptureMissingRunMediaResult>;
  openRunHtml(request: OpenRunHtmlRequest): Promise<OpenRunHtmlResponse>;
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

export interface OpenRunHtmlResponse {
  opened: true;
  path: string;
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
  const captureMissingRunMedia =
    dependencies.captureMissingRunMedia ?? defaultCaptureMissingRunMedia;
  const captureSingleRunMedia =
    dependencies.captureSingleRunMedia ?? defaultCaptureSingleRunMedia;
  const openFile = dependencies.openFile ?? defaultOpenFile;

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

    async captureMissingMedia(request = {}) {
      assertWritesEnabled(enableWrites);
      const force = readOptionalBoolean(request.force, "force") ?? false;
      if (force && !request.runDirectory) {
        throw new ApiRequestError(400, "force recapture requires a runDirectory.");
      }
      if (request.runDirectory) {
        return captureSingleRunMedia({
          runsRoot,
          runDirectory: readRequiredString(request.runDirectory, "runDirectory"),
          force
        });
      }

      return captureMissingRunMedia({ runsRoot });
    },

    async openRunHtml(request) {
      assertWritesEnabled(enableWrites);
      const path = await resolveRunHtmlPath({
        runsRoot,
        runDirectory: readRequiredString(request.runDirectory, "runDirectory"),
        asset: request.asset ?? "index.html"
      });
      await openFile(path);

      return {
        opened: true,
        path
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

async function defaultOpenFile(path: string): Promise<void> {
  await execFileAsync("open", [path]);
}

async function resolveRunHtmlPath(input: {
  runsRoot: string;
  runDirectory: string;
  asset: string;
}): Promise<string> {
  const runsRoot = resolve(input.runsRoot);
  const runDirectory = resolve(input.runDirectory);
  const asset = assertSafeRunAssetPath(input.asset);

  if (!isPathInside(runDirectory, runsRoot)) {
    throw new ApiRequestError(400, "Run directory is outside the configured runs folder.");
  }

  const path = resolveRunAssetPath(runDirectory, asset);
  if (extname(path).toLowerCase() !== ".html") {
    throw new ApiRequestError(400, "Only generated HTML files can be opened.");
  }

  const result = await stat(path);
  if (!result.isFile()) {
    throw new ApiRequestError(400, "HTML path does not point to a file.");
  }

  return path;
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

export function assertTrustedWriteRequest(request: Request): void {
  if (request.method !== "POST" && request.method !== "DELETE") {
    return;
  }

  const contentType = request.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new ApiRequestError(415, "Write requests must use application/json.");
  }

  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    throw new ApiRequestError(403, "Write requests must come from the local app origin.");
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    return;
  }

  let requestOrigin: string;
  let providedOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
    providedOrigin = new URL(origin).origin;
  } catch {
    throw new ApiRequestError(403, "Write requests must come from the local app origin.");
  }

  if (providedOrigin !== requestOrigin) {
    throw new ApiRequestError(403, "Write requests must come from the local app origin.");
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

function readOptionalBoolean(value: unknown, field: string): boolean | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new ApiRequestError(400, `${field} must be a boolean.`);
  }
  return value;
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
