import type { ModelSourceId, RunKind } from "../lib/types";
import type { ModelSyncTarget } from "../lib/model-sync";
import type { PrepareRunRunner } from "../lib/prompt-prep";

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

/**
 * Request validation and input-reading helpers for the local API.
 *
 * Extracted from api.ts to keep the API class focused on handler logic.
 */

export type EditableRunBackend = "unrecorded" | "omlx" | "lmstudio" | "llama.cpp" | "ollama" | "mlx" | "custom";
export type EditableRunHarness = "manual" | "pi" | "opencode" | "hermes";

export function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiRequestError(400, `${field} must be a non-empty string.`);
  }
  return value.trim();
}

export function readOptionalString(value: unknown, field: string): string | undefined {
  if (typeof value === "undefined" || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ApiRequestError(400, `${field} must be a string.`);
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function readOptionalBoolean(value: unknown, field: string): boolean | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new ApiRequestError(400, `${field} must be a boolean.`);
  }
  return value;
}

export function readStringArray(value: unknown, field: string): string[] {
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

export function readRunKind(value: unknown): RunKind {
  if (value === undefined || value === null || value === "") {
    return "visual";
  }
  if (value === "visual") {
    return value;
  }
  throw new ApiRequestError(400, "kind must be visual.");
}

export function readPrepareRunner(value: unknown): PrepareRunRunner {
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

export function readModelSource(value: unknown): ModelSourceId | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (value === "omlx" || value === "lmstudio") {
    return value;
  }
  if (value === "custom") {
    return value;
  }
  throw new ApiRequestError(400, "modelSource must be omlx, lmstudio, or custom.");
}

export function readRunBackend(value: unknown): EditableRunBackend {
  if (value === undefined || value === null || value === "") {
    return "unrecorded";
  }
  if (
    value === "unrecorded" ||
    value === "omlx" ||
    value === "lmstudio" ||
    value === "llama.cpp" ||
    value === "ollama" ||
    value === "mlx" ||
    value === "custom"
  ) {
    return value;
  }
  throw new ApiRequestError(400, "backend must be unrecorded, omlx, lmstudio, llama.cpp, ollama, mlx, or custom.");
}

export function readRunHarness(value: unknown): EditableRunHarness {
  if (value === undefined || value === null || value === "") {
    return "manual";
  }
  if (value === "manual" || value === "pi" || value === "opencode" || value === "hermes") {
    return value;
  }
  throw new ApiRequestError(400, "harness must be manual, pi, opencode, or hermes.");
}

export function readModelSyncTargets(value: unknown): ModelSyncTarget[] {
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

export function harnessLabel(harness: EditableRunHarness): string {
  if (harness === "pi") return "Pi";
  if (harness === "opencode") return "OpenCode";
  if (harness === "hermes") return "Hermes";
  return "manual";
}

export function assertWritesEnabled(enableWrites: boolean): void {
  if (!enableWrites) {
    throw new ApiRequestError(403, "Write actions are only available in dev server mode.");
  }
}

export function selectBenchmark<T extends { id: string }>(benchmarks: T[], requestedId: string): T {
  const byId = new Map(benchmarks.map((benchmark) => [benchmark.id, benchmark]));
  const selected = byId.get(requestedId);
  if (!selected) {
    throw new ApiRequestError(400, `Unknown benchmark ID: ${requestedId}.`);
  }
  return selected;
}