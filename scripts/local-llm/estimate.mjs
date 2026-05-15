import { existsSync, statSync } from "node:fs";
import { readGgufMetadata } from "./gguf.mjs";
import { colors, formatBytes, renderRows } from "./ui.mjs";

export function estimateMemory(profile) {
  const modelBytes = statSync(profile.modelPath).size;
  const mmprojBytes = profile.mmprojPath && existsSync(profile.mmprojPath) ? statSync(profile.mmprojPath).size : 0;
  const metadata = readGgufMetadata(profile.modelPath);
  const architecture = metadata["general.architecture"];
  const prefix = typeof architecture === "string" ? architecture : null;
  const layers = numberMeta(metadata, prefix && `${prefix}.block_count`);
  const headKv = numberOrArrayMeta(metadata, prefix && `${prefix}.attention.head_count_kv`);
  const keyLength = numberOrArrayMeta(metadata, prefix && `${prefix}.attention.key_length`);
  const valueLength = numberOrArrayMeta(metadata, prefix && `${prefix}.attention.value_length`);
  const slidingWindow = numberMeta(metadata, prefix && `${prefix}.attention.sliding_window`);
  const slidingWindowPattern = booleanArrayMeta(metadata, prefix && `${prefix}.attention.sliding_window_pattern`);
  const keyLengthSwa = numberMeta(metadata, prefix && `${prefix}.attention.key_length_swa`);
  const valueLengthSwa = numberMeta(metadata, prefix && `${prefix}.attention.value_length_swa`);
  const bytesK = bytesForCacheType(profile.flags.cacheTypeK);
  const bytesV = bytesForCacheType(profile.flags.cacheTypeV);
  const kv = estimateKvBytes({
    ctxSize: profile.flags.ctxSize,
    parallel: profile.flags.parallel ?? 1,
    layers,
    headKv,
    keyLength,
    valueLength,
    slidingWindow,
    slidingWindowPattern,
    keyLengthSwa,
    valueLengthSwa,
    bytesK,
    bytesV
  });
  const overheadBytes = 1024 ** 3;
  return {
    modelBytes,
    mmprojBytes,
    kvBytes: kv.bytes,
    overheadBytes,
    totalBytes: modelBytes + mmprojBytes + kv.bytes + overheadBytes,
    note: kv.note,
    details: { architecture, layers, headKv, keyLength, valueLength, slidingWindow, slidingWindowPattern, keyLengthSwa, valueLengthSwa, bytesK, bytesV, kvMode: kv.mode }
  };
}

export function renderEstimate(profile) {
  const estimate = estimateMemory(profile);
  const rows = [
    ["Model file", formatBytes(estimate.modelBytes)],
    ["MMProj file", profile.mmprojPath ? formatBytes(estimate.mmprojBytes) : "none"],
    ["KV cache", estimate.kvBytes ? `~${formatBytes(estimate.kvBytes)}` : "unknown"],
    ["Runtime overhead", `~${formatBytes(estimate.overheadBytes)}`],
    [colors.bold("Estimated total"), colors.bold(`~${formatBytes(estimate.totalBytes)}`)],
    ["Context", String(profile.flags.ctxSize)],
    ["Parallel slots", String(profile.flags.parallel ?? 1)],
    ["KV type", `${profile.flags.cacheTypeK} / ${profile.flags.cacheTypeV}`],
    ["Flash attention", String(profile.flags.flashAttention)]
  ];
  return colors.bold("Memory estimate") + "\n" + renderRows(rows) + (estimate.note ? `\n${colors.yellow(estimate.note)}` : "");
}

export function renderEstimateExplanation(profile) {
  const estimate = estimateMemory(profile);
  const details = estimate.details;
  const kvHeads = Array.isArray(details.headKv) ? `${details.headKv.length} layer-specific values` : (details.headKv ?? "?");
  const keyLen = Array.isArray(details.keyLength) ? `${details.keyLength.length} layer-specific values` : (details.keyLength ?? "?");
  const valueLen = Array.isArray(details.valueLength) ? `${details.valueLength.length} layer-specific values` : (details.valueLength ?? "?");
  const lines = [
    colors.bold("How this estimate was calculated"),
    `Total ≈ model file + mmproj file + KV cache + ~1GB runtime overhead.`,
    `Model and mmproj sizes are read directly from disk.`,
    `KV cache uses GGUF metadata when available: architecture=${details.architecture ?? "unknown"}, layers=${details.layers ?? "?"}, kv_heads=${kvHeads}, key_len=${keyLen}, value_len=${valueLen}.`,
    details.kvMode === "layered-swa"
      ? `KV formula handles layer-specific KV heads plus sliding-window attention: sliding layers use min(ctxSize, sliding_window=${details.slidingWindow}) with SWA key/value lengths when present; full layers use ctxSize.`
      : `KV formula: ctxSize × parallel × layers × kv_heads × ((key_len × ${profile.flags.cacheTypeK}) + (value_len × ${profile.flags.cacheTypeV})).`,
    `This is an estimate, not a promise; llama.cpp may allocate extra buffers depending on flags and backend.`
  ];
  return lines.join("\n");
}

function estimateKvBytes(input) {
  const { ctxSize, parallel, layers, bytesK, bytesV } = input;
  if (!layers || !ctxSize || !bytesK || !bytesV) {
    return { bytes: 0, note: "KV estimate unavailable: missing GGUF architecture metadata.", mode: "unknown" };
  }

  const canLayer = input.headKv && input.keyLength && input.valueLength;
  if (!canLayer) return { bytes: 0, note: "KV estimate unavailable: missing GGUF architecture metadata.", mode: "unknown" };

  if (Array.isArray(input.headKv) || Array.isArray(input.keyLength) || Array.isArray(input.valueLength) || input.slidingWindowPattern?.length) {
    let total = 0;
    for (let i = 0; i < layers; i++) {
      const headKv = valueForLayer(input.headKv, i);
      let keyLength = valueForLayer(input.keyLength, i);
      let valueLength = valueForLayer(input.valueLength, i);
      let layerCtx = ctxSize;
      if (input.slidingWindowPattern?.[i] && input.slidingWindow) {
        layerCtx = Math.min(ctxSize, input.slidingWindow);
        keyLength = input.keyLengthSwa ?? keyLength;
        valueLength = input.valueLengthSwa ?? valueLength;
      }
      if (!headKv || !keyLength || !valueLength) {
        return { bytes: 0, note: "KV estimate unavailable: incomplete layer-specific GGUF metadata.", mode: "unknown" };
      }
      total += layerCtx * parallel * headKv * ((keyLength * bytesK) + (valueLength * bytesV));
    }
    return { bytes: total, note: "", mode: input.slidingWindowPattern?.length ? "layered-swa" : "layered" };
  }

  return {
    bytes: ctxSize * parallel * layers * input.headKv * ((input.keyLength * bytesK) + (input.valueLength * bytesV)),
    note: "",
    mode: "simple"
  };
}

function valueForLayer(value, index) {
  return Array.isArray(value) ? value[index] : value;
}

function numberMeta(meta, key) {
  const value = key ? meta[key] : undefined;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function numberOrArrayMeta(meta, key) {
  const value = key ? meta[key] : undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item))) return value;
  return undefined;
}

function booleanArrayMeta(meta, key) {
  const value = key ? meta[key] : undefined;
  return Array.isArray(value) && value.every((item) => typeof item === "boolean") ? value : undefined;
}

function bytesForCacheType(type) {
  const normalized = String(type ?? "").toLowerCase();
  if (normalized === "f32") return 4;
  if (normalized === "f16" || normalized === "bf16") return 2;
  if (normalized === "q8_0") return 1;
  if (["q4_0", "q4_1", "iq4_nl"].includes(normalized)) return 0.5;
  if (["q5_0", "q5_1"].includes(normalized)) return 0.625;
  return undefined;
}
