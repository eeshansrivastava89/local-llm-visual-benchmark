export const PRESETS = {
  "visual-coding-balanced": {
    label: "Visual coding balanced",
    flags: {
      host: "127.0.0.1",
      port: 8080,
      ctxSize: 32768,
      flashAttention: "on",
      cacheTypeK: "bf16",
      cacheTypeV: "bf16",
      jinja: true,
      temperature: 0.6,
      topP: 0.95,
      topK: 20,
      minP: 0,
      presencePenalty: 0,
      repeatPenalty: 1.0,
      parallel: 1,
      batchSize: 512
    }
  },
  "visual-general": {
    label: "Visual general",
    flags: {
      host: "127.0.0.1",
      port: 8080,
      ctxSize: 32768,
      flashAttention: "on",
      cacheTypeK: "bf16",
      cacheTypeV: "bf16",
      jinja: true,
      temperature: 0.7,
      topP: 0.8,
      topK: 20,
      minP: 0,
      presencePenalty: 1.5,
      repeatPenalty: 1.0,
      parallel: 1,
      batchSize: 512
    }
  },
  "low-memory": {
    label: "Low memory",
    flags: {
      host: "127.0.0.1",
      port: 8080,
      ctxSize: 16384,
      flashAttention: "on",
      cacheTypeK: "f16",
      cacheTypeV: "f16",
      jinja: true,
      temperature: 0.6,
      topP: 0.95,
      topK: 20,
      minP: 0,
      presencePenalty: 0,
      repeatPenalty: 1.0,
      parallel: 1,
      batchSize: 512
    }
  }
};
