import { BACKENDS, backendFor, inferBackendId } from "./backends.mjs";

// Legacy constants preserved for backward compatibility.
// Server variant IDs map 1:1 to backend IDs for local-server backends.
export const LLAMA_SERVER_BINARY = BACKENDS["llama-cpp"].binary;

export const SERVER_VARIANTS = {
  standard: BACKENDS["llama-cpp"],
  mtp: BACKENDS["llama-cpp-mtp"]
};

export function normalizeServerVariantId(value, providerId) {
  if (value && SERVER_VARIANTS[value]) return value;
  if (providerId === SERVER_VARIANTS.mtp.providerId) return "mtp";
  return "standard";
}

export function inferServerVariantId(modelOrProfile) {
  return inferBackendId(modelOrProfile) === "llama-cpp-mtp" ? "mtp" : "standard";
}

export function serverVariantFor(profile) {
  const id = normalizeServerVariantId(profile?.serverVariant, profile?.providerId);
  return SERVER_VARIANTS[id];
}

export function serverBinaryFor(profile) {
  const backendId = profile?.backend ?? (profile?.serverVariant === "mtp" ? "llama-cpp-mtp" : "llama-cpp");
  return backendFor(backendId).binary;
}

export function serverExtraArgsFor(profile) {
  const backendId = profile?.backend ?? (profile?.serverVariant === "mtp" ? "llama-cpp-mtp" : "llama-cpp");
  return backendFor(backendId).extraArgs;
}