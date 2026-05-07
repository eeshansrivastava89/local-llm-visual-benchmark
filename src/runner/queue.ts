import { basename } from "node:path";
import { appendHtmlOutputContract } from "./benchmarks";
import {
  DEFAULT_CAPTURE_SETTINGS,
  normalizeCaptureSettings,
  type PartialCaptureSettings
} from "./capture";
import { captureRunPreview } from "./capture";
import { writeExtractedHtmlRun } from "./extract-html";
import { requestLmStudioCompletion } from "./lmstudio";
import { buildRunPaths, createRunId, slugModelId, type RunPaths } from "./paths";
import {
  markRunCancelled,
  markRunFailed,
  updateRunMetadata,
  writeRunMetadata
} from "./runs";
import type {
  BenchmarkRecord,
  CaptureSettings,
  LMStudioModel,
  QueueJob,
  RunMetadata
} from "./types";

export interface ExpandQueueMatrixInput {
  benchmarks: BenchmarkRecord[];
  models: LMStudioModel[];
  repeatCount: number;
  settings?: PartialCaptureSettings;
}

export type QueueStatus =
  | "idle"
  | "running"
  | "stopping"
  | "completed"
  | "cancelled";

export interface QueueState {
  status: QueueStatus;
  activeJob?: QueueJob;
  pendingJobs: QueueJob[];
  completedJobs: QueueJob[];
  failedJobs: QueueJob[];
  skippedJobs: QueueJob[];
  cancelledJob?: QueueJob;
  totalJobs: number;
}

export interface QueueCompletionRequest {
  job: QueueJob;
  benchmark: BenchmarkRecord;
  model: LMStudioModel;
  prompt: string;
  signal: AbortSignal;
}

export type QueueRequestCompletion = (
  request: QueueCompletionRequest
) => Promise<string>;

export interface QueueCapturePreviewRequest {
  job: QueueJob;
  settings: CaptureSettings;
  signal: AbortSignal;
  now: Date;
}

export type QueueCapturePreview = (
  paths: RunPaths,
  request: QueueCapturePreviewRequest
) => Promise<RunMetadata | void>;

export interface BenchmarkQueueDependencies {
  runsRoot?: string;
  lmStudioBaseUrl?: string;
  lmStudioTimeoutMs?: number;
  now?: () => Date;
  createRunId?: (job: QueueJob, now: Date) => string;
  requestCompletion?: QueueRequestCompletion;
  capturePreview?: QueueCapturePreview;
}

interface ActiveRun {
  job: QueueJob;
  paths: RunPaths;
}

export function expandQueueMatrix(input: ExpandQueueMatrixInput): QueueJob[] {
  const repeatCount = normalizeRepeatCount(input.repeatCount);
  const settings = normalizeCaptureSettings(input.settings ?? DEFAULT_CAPTURE_SETTINGS);
  const jobs: QueueJob[] = [];

  for (const benchmark of input.benchmarks) {
    for (const model of input.models) {
      const modelSlug = slugModelId(model.id);

      for (let repeatIndex = 1; repeatIndex <= repeatCount; repeatIndex += 1) {
        jobs.push({
          id: `${benchmark.id}__${modelSlug}__repeat-${repeatIndex}-of-${repeatCount}`,
          benchmark,
          model,
          repeatIndex,
          repeatTotal: repeatCount,
          settings,
          status: "queued"
        });
      }
    }
  }

  return jobs;
}

export class BenchmarkQueue {
  private readonly runsRoot?: string;
  private readonly now: () => Date;
  private readonly createRunIdForJob: (job: QueueJob, now: Date) => string;
  private readonly requestCompletion: QueueRequestCompletion;
  private readonly capturePreview: QueueCapturePreview;
  private readonly usedRunIds = new Map<string, number>();
  private readonly state: QueueState;
  private activeAbortController?: AbortController;
  private stopRequested = false;
  private cancelRequested = false;
  private started = false;

  constructor(
    jobs: QueueJob[],
    dependencies: BenchmarkQueueDependencies = {}
  ) {
    this.runsRoot = dependencies.runsRoot;
    this.now = dependencies.now ?? (() => new Date());
    this.createRunIdForJob =
      dependencies.createRunId ?? ((_job, now) => createRunId(now));
    this.requestCompletion =
      dependencies.requestCompletion ??
      ((request) =>
        requestLmStudioCompletion({
          modelId: request.model.id,
          prompt: request.prompt,
          baseUrl: dependencies.lmStudioBaseUrl,
          timeoutMs: dependencies.lmStudioTimeoutMs,
          signal: request.signal
        }));
    this.capturePreview =
      dependencies.capturePreview ??
      ((paths, request) =>
        captureRunPreview(paths, {
          settings: request.settings,
          now: request.now
        }));
    this.state = {
      status: "idle",
      pendingJobs: jobs.map((job) => ({ ...job, status: "queued" })),
      completedJobs: [],
      failedJobs: [],
      skippedJobs: [],
      totalJobs: jobs.length
    };
  }

  getState(): QueueState {
    return cloneState(this.state);
  }

  stopAfterCurrent(): void {
    if (this.state.status === "running") {
      this.stopRequested = true;
      this.state.status = "stopping";
    }
  }

  cancelNow(reason = "Queue cancelled by user."): void {
    if (this.state.status === "running" || this.state.status === "stopping") {
      this.cancelRequested = true;
      this.state.status = "cancelled";
      this.activeAbortController?.abort(new Error(reason));
    }
  }

  async start(): Promise<QueueState> {
    if (this.started) {
      throw new Error("Benchmark queue has already been started.");
    }

    this.started = true;
    this.state.status = "running";

    while (this.state.pendingJobs.length > 0) {
      if (this.cancelRequested) {
        break;
      }

      if (this.stopRequested) {
        this.skipPendingJobs();
        break;
      }

      const job = this.state.pendingJobs.shift();
      if (!job) {
        break;
      }

      const runningJob = { ...job, status: "running" as const };
      this.state.activeJob = runningJob;
      this.activeAbortController = new AbortController();

      const result = await this.runJob(
        runningJob,
        this.activeAbortController.signal
      );

      this.activeAbortController = undefined;
      this.state.activeJob = undefined;

      if (result === "cancelled") {
        break;
      }

      if (this.stopRequested) {
        this.skipPendingJobs();
        break;
      }
    }

    if (this.cancelRequested) {
      this.state.status = "cancelled";
    } else if (this.stopRequested) {
      this.state.status = "completed";
    } else {
      this.state.status = "completed";
    }

    return this.getState();
  }

  private async runJob(
    job: QueueJob,
    signal: AbortSignal
  ): Promise<"completed" | "failed" | "cancelled"> {
    const activeRun = await this.createRun(job);

    try {
      throwIfAborted(signal);
      const rawResponse = await this.requestCompletion({
        job,
        benchmark: job.benchmark,
        model: job.model,
        prompt: appendHtmlOutputContract(job.benchmark.prompt),
        signal
      });

      throwIfAborted(signal);
      await writeExtractedHtmlRun(activeRun.paths, rawResponse, {
        now: this.now()
      });

      throwIfAborted(signal);
      await this.capturePreview(activeRun.paths, {
        job,
        settings: job.settings,
        signal,
        now: this.now()
      });

      throwIfAborted(signal);
      await this.markCompleted(activeRun);
      this.state.completedJobs.push({ ...job, status: "completed" });
      return "completed";
    } catch (error) {
      if (this.cancelRequested || signal.aborted) {
        await markRunCancelled(
          activeRun.paths,
          cancellationError(error, signal),
          this.now()
        );
        this.state.cancelledJob = { ...job, status: "cancelled" };
        return "cancelled";
      }

      await markRunFailed(activeRun.paths, error, this.now());
      this.state.failedJobs.push({ ...job, status: "failed" });
      return "failed";
    }
  }

  private async createRun(job: QueueJob): Promise<ActiveRun> {
    const timestamp = this.now();
    const timestampIso = timestamp.toISOString();
    const runId = this.uniqueRunId(job, timestamp);
    const paths = buildRunPaths({
      runsRoot: this.runsRoot,
      benchmarkId: job.benchmark.id,
      modelId: job.model.id,
      runId
    });

    await writeRunMetadata(paths, {
      runId,
      benchmark: job.benchmark,
      model: {
        id: job.model.id,
        slug: paths.modelSlug
      },
      status: "running",
      createdAt: timestampIso,
      updatedAt: timestampIso,
      runDirectory: paths.runDirectory,
      settings: job.settings,
      assets: {
        metadata: basename(paths.metadataPath),
        rawResponse: basename(paths.rawResponsePath),
        html: basename(paths.htmlPath),
        preview: basename(paths.previewPath),
        ...(job.settings.preview.video ? { video: basename(paths.videoPath) } : {})
      },
      queuedAt: timestampIso,
      startedAt: timestampIso
    });

    return {
      job,
      paths
    };
  }

  private async markCompleted(activeRun: ActiveRun): Promise<RunMetadata> {
    const timestamp = this.now().toISOString();

    return updateRunMetadata(activeRun.paths, {
      status: "completed",
      updatedAt: timestamp,
      completedAt: timestamp
    });
  }

  private skipPendingJobs(): void {
    const skipped = this.state.pendingJobs.splice(0).map((job) => ({
      ...job,
      status: "skipped" as const
    }));
    this.state.skippedJobs.push(...skipped);
  }

  private uniqueRunId(job: QueueJob, now: Date): string {
    const baseRunId = this.createRunIdForJob(job, now);
    const currentCount = this.usedRunIds.get(baseRunId) ?? 0;
    this.usedRunIds.set(baseRunId, currentCount + 1);

    return currentCount === 0 ? baseRunId : `${baseRunId}-${currentCount + 1}`;
  }
}

function normalizeRepeatCount(repeatCount: number): number {
  if (!Number.isInteger(repeatCount) || repeatCount < 1) {
    throw new Error("Queue repeatCount must be a positive integer.");
  }

  return repeatCount;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw cancellationError(undefined, signal);
  }
}

function cancellationError(error: unknown, signal: AbortSignal): Error {
  if (error instanceof Error) {
    return error;
  }

  if (signal.reason instanceof Error) {
    return signal.reason;
  }

  return new Error("Queue job was cancelled.");
}

function cloneState(state: QueueState): QueueState {
  return {
    status: state.status,
    activeJob: state.activeJob ? { ...state.activeJob } : undefined,
    pendingJobs: state.pendingJobs.map((job) => ({ ...job })),
    completedJobs: state.completedJobs.map((job) => ({ ...job })),
    failedJobs: state.failedJobs.map((job) => ({ ...job })),
    skippedJobs: state.skippedJobs.map((job) => ({ ...job })),
    cancelledJob: state.cancelledJob ? { ...state.cancelledJob } : undefined,
    totalJobs: state.totalJobs
  };
}
