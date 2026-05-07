export type RunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "skipped";

export const RUN_STATUSES: readonly RunStatus[] = [
  "queued",
  "running",
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

export interface QueueJob {
  id: string;
  benchmark: BenchmarkRecord;
  model: LMStudioModel;
  repeatIndex: number;
  repeatTotal: number;
  settings: CaptureSettings;
  status: RunStatus;
}

export interface RunAssets {
  metadata: string;
  rawResponse?: string;
  html?: string;
  preview?: string;
  video?: string;
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
}

export interface RunCaptureMetadata {
  preview?: RunCaptureAsset;
  video?: RunCaptureAsset;
}

export interface RunMetadata {
  runId: string;
  benchmark: BenchmarkRecord;
  model: RunModelRecord;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  runDirectory: string;
  settings: CaptureSettings;
  assets: RunAssets;
  queuedAt?: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  cancelledAt?: string;
  skippedAt?: string;
  error?: RunError;
  capture?: RunCaptureMetadata;
}
