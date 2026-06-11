import { basename } from "node:path";
import { serverBinaryFor, serverExtraArgsFor } from "./server-variants.mjs";

export function buildArgv(profile) {
  if (Array.isArray(profile.commandArgv)) return profile.commandArgv;
  return buildArgvFromFlags(profile);
}

export function buildArgvFromFlags(profile) {
  const f = profile.flags;
  const argv = [];
  argv.push("--model", profile.modelPath);
  if (profile.mmprojPath) argv.push("--mmproj", profile.mmprojPath);
  if (profile.draftModelPath) argv.push("--spec-draft-model", profile.draftModelPath);
  argv.push("--alias", profile.modelAlias);
  argv.push("--host", String(f.host));
  argv.push("--port", String(f.port));
  argv.push("--ctx-size", String(f.ctxSize));
  argv.push("--flash-attn", String(f.flashAttention));
  argv.push("--cache-type-k", String(f.cacheTypeK));
  argv.push("--cache-type-v", String(f.cacheTypeV));
  if (f.jinja) argv.push("--jinja");
  argv.push("--temp", String(f.temperature));
  argv.push("--top-p", String(f.topP));
  argv.push("--top-k", String(f.topK));
  argv.push("--min-p", Number(f.minP).toFixed(2));
  argv.push("--presence-penalty", String(f.presencePenalty));
  if (f.repeatPenalty !== undefined) argv.push("--repeat-penalty", String(f.repeatPenalty));
  if (f.batchSize) argv.push("--batch-size", String(f.batchSize));
  if (f.parallel) argv.push("--parallel", String(f.parallel));
  if (f.chatTemplateKwargs) argv.push("--chat-template-kwargs", JSON.stringify(f.chatTemplateKwargs));
  argv.push(...serverExtraArgsFor(profile));
  return argv;
}

export function buildShellCommand(profile) {
  return [quoteShell(serverBinaryFor(profile)), ...buildArgv(profile).map(quoteShell)].join(" ");
}

export function buildPrettyCommand(profile, options = {}) {
  const argv = buildArgv(profile);
  const prefix = options.exec ? "exec " : "";
  const lines = [`${prefix}${quoteShell(serverBinaryFor(profile))} \\`];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg.startsWith("--") && next && !next.startsWith("--")) {
      lines.push(`  ${arg} ${quoteShell(next)}${i + 2 < argv.length ? " \\" : ""}`);
      i += 1;
    } else {
      lines.push(`  ${arg}${i + 1 < argv.length ? " \\" : ""}`);
    }
  }
  return lines.join("\n");
}

export function commandFileText(profile) {
  return [
    "#!/usr/bin/env bash",
    "# Edit this file to change llama-server flags.",
    "# local-llm runs this file directly, so this is the source of truth.",
    "# Pi/OpenCode config is inferred from --host, --port, and --alias.",
    "",
    buildPrettyCommand(profile, { exec: true }),
    ""
  ].join("\n");
}

export function parseLlamaCommandText(text) {
  return parseLlamaCommand(text).argv;
}

export function parseLlamaCommand(text) {
  const logical = text.replace(/\\\r?\n/gu, " ");
  for (const rawLine of logical.split(/\r?\n/u)) {
    const line = stripShellComment(rawLine).trim();
    if (!line || line.startsWith("#!") || line.startsWith("set ")) continue;
    const tokens = shellSplit(line);
    if (tokens.length === 0) continue;
    let index = tokens[0] === "exec" ? 1 : 0;
    if (tokens[index] === "env") {
      index += 1;
      while (tokens[index]?.includes("=") && !tokens[index]?.startsWith("-") && !isLlamaServerToken(tokens[index])) index += 1;
    }
    const llamaIndex = tokens.findIndex((token, tokenIndex) => tokenIndex >= index && isLlamaServerToken(token));
    if (llamaIndex !== -1) return { binary: tokens[llamaIndex], argv: tokens.slice(llamaIndex + 1) };
  }
  throw new Error("Command file must contain a llama-server command.");
}

export function applyCommandArgv(profile, argv) {
  const flags = { ...(profile.flags ?? {}) };
  const modelPath = optionValue(argv, "--model") ?? optionValue(argv, "-m") ?? profile.modelPath;
  const modelAlias = optionValue(argv, "--alias") ?? profile.modelAlias ?? (modelPath ? basename(modelPath).replace(/\.gguf$/iu, "") : undefined);
  const mmprojValue = optionValue(argv, "--mmproj");
  const draftModelValue = optionValue(argv, "--spec-draft-model") ?? optionValue(argv, "-md") ?? optionValue(argv, "--model-draft");
  const host = optionValue(argv, "--host");
  const port = numberOption(argv, "--port");
  const ctxSize = numberOption(argv, "--ctx-size");
  const batchSize = numberOption(argv, "--batch-size");
  const parallel = numberOption(argv, "--parallel");

  if (host !== undefined) flags.host = host;
  if (port !== undefined) flags.port = port;
  if (ctxSize !== undefined) flags.ctxSize = ctxSize;
  applyStringOption(flags, "flashAttention", argv, "--flash-attn");
  applyStringOption(flags, "cacheTypeK", argv, "--cache-type-k");
  applyStringOption(flags, "cacheTypeV", argv, "--cache-type-v");
  applyNumberOption(flags, "temperature", argv, "--temp");
  applyNumberOption(flags, "topP", argv, "--top-p");
  applyNumberOption(flags, "topK", argv, "--top-k");
  applyNumberOption(flags, "minP", argv, "--min-p");
  applyNumberOption(flags, "presencePenalty", argv, "--presence-penalty");
  applyNumberOption(flags, "repeatPenalty", argv, "--repeat-penalty");
  if (batchSize !== undefined) flags.batchSize = batchSize;
  if (parallel !== undefined) flags.parallel = parallel;
  flags.jinja = argv.includes("--jinja");
  const ctKwargs = optionValue(argv, "--chat-template-kwargs");
  if (ctKwargs) {
    try { flags.chatTemplateKwargs = JSON.parse(ctKwargs); }
    catch { flags.chatTemplateKwargs = ctKwargs; }
  }

  const providerId = profile.providerId ?? "llama-cpp";
  return {
    ...profile,
    modelPath,
    modelAlias,
    mmprojPath: mmprojValue ?? null,
    draftModelPath: draftModelValue ?? null,
    flags,
    harnesses: {
      ...(profile.harnesses ?? {}),
      pi: { ...(profile.harnesses?.pi ?? {}), enabled: true, model: `${providerId}/${modelAlias}` },
      opencode: { ...(profile.harnesses?.opencode ?? {}), enabled: true, model: `${providerId}/${modelAlias}` }
    },
    commandArgv: argv
  };
}

export function quoteShell(value) {
  const str = String(value);
  return /^[A-Za-z0-9_/@%+=:,.-]+$/u.test(str) ? str : `'${str.replace(/'/gu, `'"'"'`)}'`;
}

function optionValue(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

function numberOption(argv, name) {
  const value = optionValue(argv, name);
  if (value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function applyStringOption(flags, key, argv, name) {
  const value = optionValue(argv, name);
  if (value !== undefined) flags[key] = value;
}

function applyNumberOption(flags, key, argv, name) {
  const value = numberOption(argv, name);
  if (value !== undefined) flags[key] = value;
}

function isLlamaServerToken(token) {
  return basename(token) === "llama-server";
}

function stripShellComment(line) {
  let result = "";
  let quote = null;
  let escaped = false;
  for (const char of line) {
    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      result += char;
      escaped = true;
      continue;
    }
    if ((char === "'" || char === '"') && !quote) {
      quote = char;
      result += char;
      continue;
    }
    if (char === quote) {
      quote = null;
      result += char;
      continue;
    }
    if (char === "#" && !quote) break;
    result += char;
  }
  return result;
}

function shellSplit(line) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaped = false;
  for (const char of line) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if ((char === "'" || char === '"') && !quote) {
      quote = char;
      continue;
    }
    if (char === quote) {
      quote = null;
      continue;
    }
    if (/\s/u.test(char) && !quote) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (quote) throw new Error("Unclosed quote in command file.");
  if (escaped) current += "\\";
  if (current) tokens.push(current);
  return tokens;
}
