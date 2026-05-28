import { execFile } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
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
  listOmlxModels as defaultListOmlxModels,
  normalizeOmlxBaseUrl
} from "../lib/omlx";
import {
  getModelSyncState as defaultGetModelSyncState,
  mirrorModelsToConfigs as defaultMirrorModelsToConfigs,
  type ModelSyncState,
  type ModelSyncTarget
} from "../lib/model-sync";
import { prepareRun as defaultPrepareRun } from "../lib/prompt-prep";
import { scoreDsRun as defaultScoreDsRun } from "../lib/score-ds-run";
import { slugModelId } from "../lib/paths";
import { exportComparisonVideo as defaultExportComparisonVideo } from "../lib/comparison-video";
import {
  deleteRunDirectory as defaultDeleteRunDirectory,
  listRunMetadata as defaultListRunMetadata
} from "../lib/runs";
import { getSystemStats as defaultGetSystemStats } from "../lib/system-stats";
import type { BenchmarkRecord, LMStudioModel, OmlxModel, PreparedRun, RunMetadata, RunRunnerMetadata } from "../lib/types";
import {
  ApiRequestError,
  assertWritesEnabled,
  harnessLabel,
  readModelSource,
  readModelSyncTargets,
  readOptionalBoolean,
  readOptionalString,
  readPrepareRunner,
  readRequiredString,
  readRunBackend,
  readRunHarness,
  readRunKind,
  readStringArray,
  selectBenchmark,
  type EditableRunBackend,
  type EditableRunHarness
} from "./api-helpers";

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
  modelSource?: string;
  kind?: string;
  runner?: string;
  baseUrl?: string;
  backendLabel?: string;
}

export interface MirrorModelsRequest {
  baseUrl?: string;
  modelIds?: unknown;
  targets?: unknown;
}

export interface DeleteRunRequest {
  runDirectory?: string;
}

export interface UpdateRunMetadataRequest {
  runDirectory?: string;
  backend?: unknown;
  customBackend?: unknown;
  harness?: unknown;
  modelId?: unknown;
}

export interface CaptureMediaRequest {
  runDirectory?: string;
  force?: unknown;
}

export interface OpenRunHtmlRequest {
  runDirectory?: string;
  asset?: string;
}

export interface OpenRunFolderRequest {
  runDirectory?: string;
}

export interface ExportComparisonVideoRequest {
  runDirectories?: unknown;
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
  listOmlxModels?: typeof defaultListOmlxModels;
  listRunMetadata?: (runsRoot?: string) => Promise<RunMetadata[]>;
  deleteRunDirectory?: typeof defaultDeleteRunDirectory;
  getSystemStats?: typeof defaultGetSystemStats;
  prepareRun?: typeof defaultPrepareRun;
  scoreDsRun?: typeof defaultScoreDsRun;
  getModelSyncState?: typeof defaultGetModelSyncState;
  mirrorModelsToConfigs?: typeof defaultMirrorModelsToConfigs;
  captureMissingRunMedia?: typeof defaultCaptureMissingRunMedia;
  captureSingleRunMedia?: typeof defaultCaptureSingleRunMedia;
  openFile?: (path: string) => Promise<void>;
  exportComparisonVideo?: typeof defaultExportComparisonVideo;
}

export interface LocalApi {
  getStatus(request?: StatusRequest): Promise<StatusResponse>;
  getBenchmarks(): Promise<BenchmarksResponse>;
  getLmStudioModels(request?: ModelsRequest): Promise<ModelsResponse>;
  getOmlxModels(request?: ModelsRequest): Promise<OmlxModelsResponse>;
  getSystemStats(): Promise<SystemStatsResponse>;
  getSavedRuns(): Promise<SavedRunsResponse>;
  deleteSavedRun(request: DeleteRunRequest): Promise<DeleteRunResponse>;
  updateSavedRunMetadata(request: UpdateRunMetadataRequest): Promise<UpdateRunMetadataResponse>;
  prepareRun(request: PrepareRunRequest): Promise<PrepareRunResponse>;
  getModelSyncState(): Promise<ModelSyncStateResponse>;
  mirrorModels(request: MirrorModelsRequest): Promise<MirrorModelsResponse>;
  scoreDsRun(request: ScoreDsRunRequest): Promise<ScoreDsRunResponse>;
  captureMissingMedia(request?: CaptureMediaRequest): Promise<CaptureMissingRunMediaResult>;
  openRunHtml(request: OpenRunHtmlRequest): Promise<OpenRunHtmlResponse>;
  openRunFolder(request: OpenRunFolderRequest): Promise<OpenRunFolderResponse>;
  exportComparisonVideo(request: ExportComparisonVideoRequest): Promise<ExportComparisonVideoResponse>;
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

export interface OmlxModelsResponse {
  baseUrl: string;
  models: OmlxModel[];
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

export interface UpdateRunMetadataResponse {
  run: RunMetadata;
}

export interface ScoreDsRunRequest {
  runDirectory?: string;
}

export interface ScoreDsRunResponse {
  scored: true;
  run: RunMetadata;
  runs: RunMetadata[];
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

export interface OpenRunFolderResponse {
  opened: true;
  path: string;
}

export interface ExportComparisonVideoResponse {
  path: string;
  runCount: number;
  layout: string;
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
  const listOmlxModels =
    dependencies.listOmlxModels ?? defaultListOmlxModels;
  const listRunMetadata = dependencies.listRunMetadata ?? defaultListRunMetadata;
  const deleteRunDirectory = dependencies.deleteRunDirectory ?? defaultDeleteRunDirectory;
  const getSystemStats = dependencies.getSystemStats ?? defaultGetSystemStats;
  const prepareRun = dependencies.prepareRun ?? defaultPrepareRun;
  const scoreDsRunFn = dependencies.scoreDsRun ?? defaultScoreDsRun;
  const getModelSyncState = dependencies.getModelSyncState ?? defaultGetModelSyncState;
  const mirrorModelsToConfigs =
    dependencies.mirrorModelsToConfigs ?? defaultMirrorModelsToConfigs;
  const captureMissingRunMedia =
    dependencies.captureMissingRunMedia ?? defaultCaptureMissingRunMedia;
  const captureSingleRunMedia =
    dependencies.captureSingleRunMedia ?? defaultCaptureSingleRunMedia;
  const openFile = dependencies.openFile ?? defaultOpenFile;
  const exportComparisonVideo = dependencies.exportComparisonVideo ?? defaultExportComparisonVideo;

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

    async getOmlxModels(request = {}) {
      return {
        baseUrl: normalizeOmlxBaseUrl(request.baseUrl),
        models: await listOmlxModels(request.baseUrl, {
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

    async updateSavedRunMetadata(request) {
      assertWritesEnabled(enableWrites);
      return {
        run: await updateRunMetadataFile({
          runsRoot,
          runDirectory: readRequiredString(request.runDirectory, "runDirectory"),
          backend: readRunBackend(request.backend),
          customBackend: readOptionalString(request.customBackend, "customBackend"),
          harness: readRunHarness(request.harness),
          modelId: readOptionalString(request.modelId, "modelId")
        })
      };
    },

    async prepareRun(request) {
      assertWritesEnabled(enableWrites);
      readRunKind(request.kind);
      const benchmark = selectBenchmark(
        await loadBenchmarks(benchmarkDirectory),
        readRequiredString(request.benchmarkId, "benchmarkId")
      );

      return {
        preparedRun: await prepareRun({
          benchmark,
          modelId: readRequiredString(request.modelId, "modelId"),
          modelSource: readModelSource(request.modelSource),
          runner: readPrepareRunner(request.runner),
          kind: readRunKind(request.kind),
          baseUrl: readOptionalString(request.baseUrl, "baseUrl"),
          backendLabel: readOptionalString(request.backendLabel, "backendLabel"),
          runsRoot
        })
      };
    },

    async scoreDsRun(request: ScoreDsRunRequest) {
      assertWritesEnabled(enableWrites);
      const result = await scoreDsRunFn({
        runsRoot,
        runDirectory: readRequiredString(request.runDirectory, "runDirectory")
      });
      const runs = await listRunMetadata(runsRoot);
      return {
        scored: true as const,
        run: result.run,
        runs
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

    async openRunFolder(request) {
      assertWritesEnabled(enableWrites);
      const path = await resolveRunDirectoryPath({
        runsRoot,
        runDirectory: readRequiredString(request.runDirectory, "runDirectory")
      });
      await openFile(path);

      return {
        opened: true,
        path
      };
    },

    async exportComparisonVideo(request) {
      assertWritesEnabled(enableWrites);
      const runDirectories = readStringArray(request.runDirectories, "runDirectories");
      return exportComparisonVideo({ runsRoot, runDirectories });
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

interface RunMetadataPatchInput {
  runsRoot: string;
  runDirectory: string;
  backend: EditableRunBackend;
  customBackend?: string;
  harness: EditableRunHarness;
  modelId?: string;
}

async function updateRunMetadataFile(input: RunMetadataPatchInput): Promise<RunMetadata> {
  const runDirectory = await resolveRunDirectoryPath({
    runsRoot: input.runsRoot,
    runDirectory: input.runDirectory
  });
  const metadataPath = join(runDirectory, "metadata.json");
  const current = JSON.parse(await readFile(metadataPath, "utf8")) as RunMetadata;
  const now = new Date().toISOString();
  const modelId = input.modelId ?? current.model?.id;
  const next: RunMetadata = {
    ...current,
    ...(modelId ? { model: { ...(current.model ?? {}), id: modelId, slug: current.model?.slug ?? slugModelId(modelId) } } : {}),
    runDirectory,
    updatedAt: now,
    runner: updateRunnerMetadata(current.runner, input.backend, input.harness, input.customBackend, modelId)
  };

  await writeFile(metadataPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

function updateRunnerMetadata(
  runner: RunRunnerMetadata | undefined,
  backend: EditableRunBackend,
  harness: EditableRunHarness,
  customBackend?: string,
  modelId?: string
): RunRunnerMetadata {
  return {
    ...(runner ?? { mode: harness === "manual" ? "manual" : "external" }),
    mode: harness === "manual" ? "manual" : "external",
    ...runnerBackendPatch(backend, customBackend),
    ...(modelId ? { model: modelId } : {}),
    intendedRunner: harnessLabel(harness),
    actualRunner: undefined,
    harnessLabel: undefined
  };
}

function runnerBackendPatch(backend: EditableRunBackend, customBackend?: string): Pick<RunRunnerMetadata, "modelSource" | "backendLabel"> {
  if (backend === "unrecorded") {
    return {
      modelSource: undefined,
      backendLabel: undefined
    };
  }
  if (backend === "omlx") {
    return {
      modelSource: "omlx",
      backendLabel: "oMLX"
    };
  }
  if (backend === "lmstudio") {
    return {
      modelSource: "lmstudio",
      backendLabel: "LM Studio"
    };
  }
  if (backend === "custom") {
    return {
      modelSource: "custom",
      backendLabel: customBackend ?? "Custom"
    };
  }
  return {
    modelSource: undefined,
    backendLabel: backend === "mlx" ? "Base MLX" : backend
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

async function resolveRunDirectoryPath(input: {
  runsRoot: string;
  runDirectory: string;
}): Promise<string> {
  const runsRoot = resolve(input.runsRoot);
  const runDirectory = resolve(input.runDirectory);

  if (!isPathInside(runDirectory, runsRoot)) {
    throw new ApiRequestError(400, "Run directory is outside the configured runs folder.");
  }

  const result = await stat(runDirectory);
  if (!result.isDirectory()) {
    throw new ApiRequestError(400, "Run path does not point to a directory.");
  }

  return runDirectory;
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
  if (request.method !== "POST" && request.method !== "PATCH" && request.method !== "DELETE") {
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