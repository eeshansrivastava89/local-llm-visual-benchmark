export const LLAMA_SERVER_BINARY = "/Users/eeshans/dev/llama.cpp-mtp/build/bin/llama-server";

export const SERVER_VARIANTS = {
  standard: {
    label: "Standard llama.cpp",
    hint: "shared upstream llama-server on port 8080",
    providerId: "llama-cpp",
    binary: LLAMA_SERVER_BINARY,
    flags: { port: 8080 },
    extraArgs: []
  },
  mtp: {
    label: "MTP llama.cpp",
    hint: "shared upstream llama-server with draft-mtp on port 8081",
    providerId: "llama-cpp-mtp",
    binary: LLAMA_SERVER_BINARY,
    flags: { port: 8081 },
    extraArgs: ["--spec-type", "draft-mtp", "--spec-draft-n-max", "2"]
  }
};

export function normalizeServerVariantId(value, providerId) {
  if (value && SERVER_VARIANTS[value]) return value;
  if (providerId === SERVER_VARIANTS.mtp.providerId) return "mtp";
  return "standard";
}

export function inferServerVariantId(modelOrProfile) {
  const haystack = [
    modelOrProfile?.path,
    modelOrProfile?.modelPath,
    modelOrProfile?.label,
    modelOrProfile?.modelAlias,
    modelOrProfile?.id,
    modelOrProfile?.providerId
  ].filter(Boolean).join(" ").toLowerCase();
  if (haystack.includes("mtp") || haystack.includes(SERVER_VARIANTS.mtp.providerId)) return "mtp";
  return "standard";
}

export function serverVariantFor(profile) {
  const id = normalizeServerVariantId(profile?.serverVariant, profile?.providerId);
  return SERVER_VARIANTS[id];
}

export function serverBinaryFor(profile) {
  return profile?.serverBinary ?? serverVariantFor(profile).binary;
}

export function serverExtraArgsFor(profile) {
  if (Array.isArray(profile?.serverExtraArgs)) return profile.serverExtraArgs;
  return serverVariantFor(profile).extraArgs;
}
