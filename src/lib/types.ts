export type RunStatus =
  | "prepared"
  | "completed"
  | "failed"
  | "cancelled"
  | "skipped";

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
}

export interface PreparedRun {
  run: RunMetadata;
  prompt: string;
  paths: {
    runDirectory: string;
    promptPath: string;
    htmlPath: string;
    metadataPath: string;
    previewPath: string;
  };
}
