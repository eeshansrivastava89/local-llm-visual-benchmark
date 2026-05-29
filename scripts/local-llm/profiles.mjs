import { existsSync } from "node:fs";
import { chmod, mkdir, readdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { commandFileText, applyCommandArgv, parseLlamaCommand } from "./command.mjs";
import { PROFILE_DIR, RUN_DIR, LOG_DIR } from "./paths.mjs";
import { normalizeServerVariantId, SERVER_VARIANTS } from "./server-variants.mjs";

export function profileDir(id) {
  return join(PROFILE_DIR, sanitizeProfileId(id));
}

export function profileJsonPath(id) {
  return join(profileDir(id), "profile.json");
}

export function commandPath(id) {
  return join(profileDir(id), "llama-server.sh");
}

export function notesPath(id) {
  return join(profileDir(id), "notes.md");
}

export function legacyProfilePath(id) {
  return join(PROFILE_DIR, `${sanitizeProfileId(id)}.json`);
}

export function profilePath(id) {
  return profileJsonPath(id);
}

export function profileExists(id) {
  return existsSync(profileJsonPath(id)) || existsSync(legacyProfilePath(id)) || existsSync(commandPath(id));
}

export function statePath(id) {
  return join(RUN_DIR, `${sanitizeProfileId(id)}.state.json`);
}

export async function deleteProfile(profile, options = {}) {
  const id = sanitizeProfileId(profile.id ?? profile);
  const results = { profileDir: false, legacyFile: false, state: false, logs: [] };

  // Delete directory-based profile
  const dir = profileDir(id);
  if (existsSync(dir)) {
    await rm(dir, { recursive: true, force: true });
    results.profileDir = true;
  }

  // Delete legacy flat JSON file
  const legacyPath = legacyProfilePath(id);
  if (existsSync(legacyPath)) {
    await unlink(legacyPath);
    results.legacyFile = true;
  }

  // Delete state file
  const stateFile = statePath(id);
  if (existsSync(stateFile)) {
    await unlink(stateFile);
    results.state = true;
  }

  // Delete logs (unless --keep-logs)
  if (!options.keepLogs) {
    const entries = await readdir(LOG_DIR, { withFileTypes: true }).catch(() => []);
    const prefix = `${id}-`;
    for (const entry of entries) {
      if (entry.isFile() && entry.name.startsWith(prefix)) {
        await unlink(join(LOG_DIR, entry.name));
        results.logs.push(entry.name);
      }
    }
  }

  return results;
}

export async function loadProfiles() {
  const entries = await readdir(PROFILE_DIR, { withFileTypes: true }).catch(() => []);
  const ids = new Set();
  const newIds = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  for (const id of newIds) {
    if (existsSync(profileJsonPath(id)) || existsSync(commandPath(id))) ids.add(id);
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const id = entry.name.replace(/\.json$/u, "");
    if (!ids.has(id)) ids.add(id);
  }
  return Promise.all(Array.from(ids).sort().map((id) => readProfile(id)));
}

export async function profileTimestamp(id) {
  const profile = await readProfile(id);
  if (profile.updatedAt || profile.createdAt) {
    return new Date(profile.updatedAt ?? profile.createdAt);
  }
  const fileStat = await stat(profile.profilePath);
  return fileStat.mtime;
}

export async function readProfile(id) {
  const sanitized = sanitizeProfileId(id);
  const newPath = profileJsonPath(sanitized);
  const legacyPath = legacyProfilePath(sanitized);
  const sourcePath = existsSync(newPath) ? newPath : legacyPath;
  const raw = existsSync(sourcePath) ? JSON.parse(await readFile(sourcePath, "utf8")) : { id: sanitized, label: sanitized };
  let profile = normalizeProfile(raw);
  profile.id = sanitizeProfileId(profile.id ?? sanitized);
  profile.profileDir = profileDir(profile.id);
  profile.profilePath = sourcePath;
  profile.commandPath = commandPath(profile.id);
  profile.commandSource = existsSync(profile.commandPath) ? "file" : "generated";

  if (existsSync(profile.commandPath)) {
    const command = parseLlamaCommand(await readFile(profile.commandPath, "utf8"));
    profile = normalizeProfile({
      ...applyCommandArgv(profile, command.argv),
      serverBinary: command.binary,
      profileDir: profile.profileDir,
      profilePath: profile.profilePath,
      commandPath: profile.commandPath,
      commandSource: "file"
    });
  }
  return profile;
}

export async function ensureProfileCommand(profile) {
  await mkdir(profileDir(profile.id), { recursive: true });
  const jsonPath = profileJsonPath(profile.id);
  await writeJson(jsonPath, profileForJson(profile));
  const path = commandPath(profile.id);
  if (!existsSync(path)) {
    await writeFile(path, commandFileText(profile), "utf8");
    await chmod(path, 0o755).catch(() => {});
  }
  if (!existsSync(notesPath(profile.id))) {
    await writeFile(notesPath(profile.id), `# ${profile.label}\n\nNotes for this local model profile.\n`, "utf8");
  }
  return readProfile(profile.id);
}

export async function saveProfile(profile) {
  const now = new Date().toISOString();
  const existing = await readJsonIfExists(profileJsonPath(profile.id), await readJsonIfExists(legacyProfilePath(profile.id), null));
  const normalized = normalizeProfile({
    ...profile,
    createdAt: existing?.createdAt ?? profile.createdAt ?? now,
    updatedAt: now
  });
  await writeJson(profileJsonPath(normalized.id), profileForJson(normalized));
  const path = commandPath(normalized.id);
  if (!existsSync(path)) {
    await writeFile(path, commandFileText(normalized), "utf8");
    await chmod(path, 0o755).catch(() => {});
  }
  if (!existsSync(notesPath(normalized.id))) {
    await writeFile(notesPath(normalized.id), `# ${normalized.label}\n\nNotes for this local model profile.\n`, "utf8");
  }
}

export async function readState(id) {
  return readJsonIfExists(statePath(id), null);
}

export async function writeState(id, state) {
  await writeJson(statePath(id), state);
}

export function normalizeProfile(profile) {
  profile.flags ??= {};
  profile.serverVariant = normalizeServerVariantId(profile.serverVariant, profile.providerId);
  profile.providerId ??= SERVER_VARIANTS[profile.serverVariant].providerId;
  profile.flags.host ??= "127.0.0.1";
  profile.flags.port ??= SERVER_VARIANTS[profile.serverVariant].flags.port;
  profile.flags.repeatPenalty ??= 1.0;
  profile.flags.parallel ??= 1;
  profile.baseUrl = baseUrlFor(profile.flags);
  profile.harnesses ??= {};
  profile.harnesses.pi ??= { enabled: true, model: `${profile.providerId}/${profile.modelAlias}` };
  profile.harnesses.opencode ??= { enabled: true, model: `${profile.providerId}/${profile.modelAlias}` };
  profile.profileDir ??= profileDir(profile.id);
  profile.profilePath ??= profileJsonPath(profile.id);
  profile.commandPath ??= commandPath(profile.id);
  return profile;
}

export function baseUrlFor(flags) {
  return `http://${flags.host}:${flags.port}/v1`;
}

export function sanitizeProfileId(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9._-]+/gu, "-").replace(/^-|-$/gu, "") || "profile";
}

export function slugFromLabel(value) {
  return sanitizeProfileId(value);
}

export async function readJsonIfExists(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function profileForJson(profile) {
  return {
    id: profile.id,
    label: profile.label,
    providerId: profile.providerId ?? "llama-cpp",
    serverVariant: profile.serverVariant ?? normalizeServerVariantId(undefined, profile.providerId),
    ...(profile.preset ? { preset: profile.preset } : {}),
    ...(profile.createdAt ? { createdAt: profile.createdAt } : {}),
    ...(profile.updatedAt ? { updatedAt: profile.updatedAt } : {})
  };
}
