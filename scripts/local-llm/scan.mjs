import { statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { LMSTUDIO_MODELS_DIR } from "./paths.mjs";

export async function scanGgufModels(root = LMSTUDIO_MODELS_DIR) {
  const files = await findFiles(root, (path) => path.toLowerCase().endsWith(".gguf"));
  const mmprojs = files.filter((path) => basename(path).toLowerCase().includes("mmproj"));
  const models = files.filter((path) => !basename(path).toLowerCase().includes("mmproj"));
  return models.map((path) => {
    const dir = dirname(path);
    const mmprojPath = mmprojs.find((candidate) => dirname(candidate) === dir) ?? null;
    const name = basename(path).replace(/\.gguf$/iu, "");
    return {
      path,
      mmprojPath,
      label: labelFromName(name),
      aliasSuggestion: aliasFromName(name),
      quant: quantFromName(name),
      sizeBytes: statSync(path).size,
      backend: "llama-cpp",
      source: "lmstudio"
    };
  }).sort((a, b) => a.label.localeCompare(b.label));
}

async function findFiles(root, predicate) {
  const result = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && predicate(path)) result.push(path);
    }
  }
  await walk(root);
  return result;
}

function labelFromName(name) {
  return name.replace(/-/gu, " ").replace(/\bqwen/iu, "Qwen").replace(/q4_k_m/iu, "Q4_K_M");
}

function aliasFromName(name) {
  return name.replace(/-Q4_K_M$/iu, "-GGUF");
}

function quantFromName(name) {
  return name.match(/(Q\d_K_[A-Z]+|UD-[A-Z0-9_]+)/u)?.[1];
}