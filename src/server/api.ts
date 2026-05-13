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
import {
  deleteRunDirectory as defaultDeleteRunDirectory,
  listRunMetadata as defaultListRunMetadata
} from "../lib/runs";
import { getSystemStats as defaultGetSystemStats } from "../lib/system-stats";
import type { BenchmarkRecord, LMStudioModel, ModelSourceId, OmlxModel, PreparedRun, RunKind, RunMetadata, RunRunnerMetadata } from "../lib/types";
import type { PrepareRunRunner } from "../lib/prompt-prep";

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
  harness?: unknown;
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
  getOmlxModels(request?: ModelsRequest): Promise<OmlxModelsResponse>;
  getSystemStats(): Promise<SystemStatsResponse>;
  getSavedRuns(): Promise<SavedRunsResponse>;
  deleteSavedRun(request: DeleteRunRequest): Promise<DeleteRunResponse>;
  updateSavedRunMetadata(request: UpdateRunMetadataRequest): Promise<UpdateRunMetadataResponse>;
  prepareRun(request: PrepareRunRequest): Promise<PrepareRunResponse>;
  getModelSyncState(): Promise<ModelSyncStateResponse>;
  mirrorModels(request: MirrorModelsRequest): Promise<MirrorModelsResponse>;
  captureMissingMedia(request?: CaptureMediaRequest): Promise<CaptureMissingRunMediaResult>;
  openRunHtml(request: OpenRunHtmlRequest): Promise<OpenRunHtmlResponse>;
  openRunFolder(request: OpenRunFolderRequest): Promise<OpenRunFolderResponse>;
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
  const listOmlxModels =
    dependencies.listOmlxModels ?? defaultListOmlxModels;
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
          harness: readRunHarness(request.harness)
        })
      };
    },

    async prepareRun(request) {
      assertWritesEnabled(enableWrites);
      readRunKind(request.kind);
      const modelId = readRequiredString(request.modelId, "modelId");
      const runner = readPrepareRunner(request.runner);
      const modelSource = readModelSource(request.modelSource);
      const benchmark = selectBenchmark(
        await loadBenchmarks(benchmarkDirectory),
        readRequiredString(request.benchmarkId, "benchmarkId")
      );

      return {
        preparedRun: await prepareRun({
          benchmark,
          modelId,
          modelSource,
          runner,
          baseUrl: readOptionalString(request.baseUrl, "baseUrl"),
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

function readRunKind(value: unknown): RunKind {
  if (value === undefined || value === null || value === "") {
    return "visual";
  }
  if (value === "visual") {
    return value;
  }
  throw new ApiRequestError(400, "kind must be visual.");
}

function readPrepareRunner(value: unknown): PrepareRunRunner {
  if (value === undefined || value === null || value === "") {
    return "manual";
  }
  if (
    value === "manual" ||
    value === "pi" ||
    value === "opencode" ||
    value === "hermes"
  ) {
    return value;
  }
  throw new ApiRequestError(400, "runner must be manual, pi, opencode, or hermes.");
}

function readModelSource(value: unknown): ModelSourceId | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (value === "omlx" || value === "lmstudio") {
    return value;
  }
  throw new ApiRequestError(400, "modelSource must be omlx or lmstudio.");
}

interface RunMetadataPatchInput {
  runsRoot: string;
  runDirectory: string;
  backend: EditableRunBackend;
  harness: EditableRunHarness;
}

type EditableRunBackend = "unrecorded" | "omlx" | "lmstudio" | "llama.cpp" | "ollama" | "mlx";
type EditableRunHarness = "manual" | "pi" | "opencode" | "hermes";

async function updateRunMetadataFile(input: RunMetadataPatchInput): Promise<RunMetadata> {
  const runDirectory = await resolveRunDirectoryPath({
    runsRoot: input.runsRoot,
    runDirectory: input.runDirectory
  });
  const metadataPath = join(runDirectory, "metadata.json");
  const current = JSON.parse(await readFile(metadataPath, "utf8")) as RunMetadata;
  const now = new Date().toISOString();
  const next: RunMetadata = {
    ...current,
    runDirectory,
    updatedAt: now,
    runner: updateRunnerMetadata(current.runner, input.backend, input.harness)
  };

  await writeFile(metadataPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

function updateRunnerMetadata(
  runner: RunRunnerMetadata | undefined,
  backend: EditableRunBackend,
  harness: EditableRunHarness
): RunRunnerMetadata {
  return {
    ...(runner ?? { mode: harness === "manual" ? "manual" : "external" }),
    mode: harness === "manual" ? "manual" : "external",
    ...runnerBackendPatch(backend),
    intendedRunner: harnessLabel(harness),
    actualRunner: undefined,
    harnessLabel: undefined
  };
}

function runnerBackendPatch(backend: EditableRunBackend): Pick<RunRunnerMetadata, "modelSource" | "backendLabel"> {
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
  return {
    modelSource: undefined,
    backendLabel: backend === "mlx" ? "Base MLX" : backend
  };
}

function harnessLabel(harness: EditableRunHarness): string {
  if (harness === "pi") return "Pi";
  if (harness === "opencode") return "OpenCode";
  if (harness === "hermes") return "Hermes";
  return "manual";
}

function readRunBackend(value: unknown): EditableRunBackend {
  if (value === undefined || value === null || value === "") {
    return "unrecorded";
  }
  if (
    value === "unrecorded" ||
    value === "omlx" ||
    value === "lmstudio" ||
    value === "llama.cpp" ||
    value === "ollama" ||
    value === "mlx"
  ) {
    return value;
  }
  throw new ApiRequestError(400, "backend must be unrecorded, omlx, lmstudio, llama.cpp, ollama, or mlx.");
}

function readRunHarness(value: unknown): EditableRunHarness {
  if (value === undefined || value === null || value === "") {
    return "manual";
  }
  if (value === "manual" || value === "pi" || value === "opencode" || value === "hermes") {
    return value;
  }
  throw new ApiRequestError(400, "harness must be manual, pi, opencode, or hermes.");
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

function readOptionalString(value: unknown, field: string): string | undefined {
  if (typeof value === "undefined" || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ApiRequestError(400, `${field} must be a string.`);
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
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
