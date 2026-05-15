import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

export const ROOT = resolve(HERE, "..", "..");
export const LOCAL_DIR = join(ROOT, ".local-llm");
export const PROFILE_DIR = join(LOCAL_DIR, "profiles");
export const LOG_DIR = join(LOCAL_DIR, "logs");
export const RUN_DIR = join(LOCAL_DIR, "run");
export const LMSTUDIO_MODELS_DIR = join(homedir(), ".lmstudio", "models");
export const PI_CONFIG = join(homedir(), ".pi", "agent", "models.json");
export const OPENCODE_CONFIG = join(homedir(), ".config", "opencode", "opencode.json");

export async function ensureLocalDirs() {
  await mkdir(PROFILE_DIR, { recursive: true });
  await mkdir(LOG_DIR, { recursive: true });
  await mkdir(RUN_DIR, { recursive: true });
}
