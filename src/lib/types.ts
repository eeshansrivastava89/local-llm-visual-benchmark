export type RunStatus =
  | "prepared"
  | "completed"
  | "failed"
  | "cancelled"
  | "skipped";

export type RunKind = "visual";

export type RunnerMode =
  | "manual"
  | "openai-compatible"
  | "external";

export const RUN_STATUSES: readonly RunStatus[] = [
  "prepared",
  "completed",
  "failed",
  "cancelled",
  "skipped"
] as const;

export interface BenchmarkRecord {
  id: string;
  title: string;
  description: string;
  prompt: string;
  sourcePath?: string;
}

export interface LMStudioModel {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
  localPath?: string;
}

export interface RunModelRecord {
  id: string;
  slug: string;
  displayName?: string;
}

export interface ViewportSettings {
  width: number;
  height: number;
}

export interface PreviewSettings {
  captureAtMs: number;
  viewport: ViewportSettings;
  video: boolean;
}

export interface CaptureSettings {
  preview: PreviewSettings;
}

export interface RunAssets {
  metadata: string;
  prompt?: string;
  rawResponse?: string;
  request?: string;
  stream?: string;
  response?: string;
  command?: string;
  html?: string;
  preview?: string;
  video?: string;
  videoMp4?: string;
}

export interface RunError {
  message: string;
  stack?: string;
}

export type CaptureAssetStatus = "ready" | "failed" | "skipped";

export interface RunCaptureAsset {
  status: CaptureAssetStatus;
  path?: string;
  capturedAt?: string;
  reason?: string;
  error?: RunError;
  quality?: {
    measuredFps?: number;
    minFps?: number;
    sampleMs?: number;
    frames?: number;
    viewport?: ViewportSettings;
    launchArgs?: string[];
  };
}

export interface RunCaptureMetadata {
  preview?: RunCaptureAsset;
  video?: RunCaptureAsset;
}

export interface RunTokenMetrics {
  reported: boolean;
  estimated?: boolean;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface RunRunnerMetadata {
  mode: RunnerMode;
  intendedRunner?: string;
  actualRunner?: string;
  backendLabel?: string;
  baseUrl?: string;
  model?: string;
  launchCommand?: string;
  requestAsset?: string;
  streamAsset?: string;
  responseAsset?: string;
  commandAsset?: string;
  metricSource?: string;
  retries?: number;
  fallbacksUsed?: string[];
  tokenMetrics?: RunTokenMetrics;
}

export interface RunMetadata {
  schemaVersion?: number;
  kind?: RunKind;
  runId: string;
  benchmark: BenchmarkRecord;
  model: RunModelRecord;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  runDirectory: string;
  settings?: CaptureSettings;
  assets: RunAssets;
  promptText?: string;
  preparedAt?: string;
  tool?: "opencode" | "pi" | "generic";
  completedAt?: string;
  failedAt?: string;
  cancelledAt?: string;
  skippedAt?: string;
  error?: RunError;
  capture?: RunCaptureMetadata;
  runner?: RunRunnerMetadata;
  notes?: string;
}

export interface PreparedRun {
  run: RunMetadata;
  prompt: string;
  command?: string;
  paths: {
    runDirectory: string;
    promptPath: string;
    commandPath: string;
    htmlPath: string;
    metadataPath: string;
    previewPath: string;
  };
}
