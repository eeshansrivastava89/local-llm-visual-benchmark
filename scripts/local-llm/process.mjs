import { spawn } from "node:child_process";
import { existsSync, openSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildShellCommand } from "./command.mjs";
import { LOG_DIR } from "./paths.mjs";
import { ensureProfileCommand, readState, writeState } from "./profiles.mjs";
import { colors } from "./ui.mjs";

export async function startServer(profile) {
  profile = await ensureProfileCommand(profile);
  assertCommandReady(profile);
  const timestamp = timestampForFile();
  const rawLogPath = join(LOG_DIR, `${profile.id}-${timestamp}.raw.log`);
  const friendlyLogPath = join(LOG_DIR, `${profile.id}-${timestamp}.friendly.log`);
  const commandText = await readFile(profile.commandPath, "utf8").catch(() => buildShellCommand(profile));
  await writeFile(rawLogPath, `[local-llm] ${new Date().toISOString()}\n[command-file] ${profile.commandPath}\n[command]\n${commandText.trim()}\n`, "utf8");
  await writeFile(friendlyLogPath, `[launch] starting llama-server for ${profile.label}\n`, "utf8");
  console.log(colors.bold(`[launch] ${profile.label}`));
  console.log(colors.dim(`Command file: ${profile.commandPath}`));
  console.log(colors.dim(`Raw log: ${rawLogPath}`));

  const rawFd = openSync(rawLogPath, "a");
  const child = spawn("/bin/bash", [profile.commandPath], {
    detached: true,
    stdio: ["ignore", rawFd, rawFd]
  });
  child.unref();
  const state = {
    pid: child.pid,
    profileId: profile.id,
    baseUrl: profile.baseUrl,
    commandPath: profile.commandPath,
    rawLogPath,
    friendlyLogPath,
    startedAt: new Date().toISOString()
  };
  await writeState(profile.id, state);
  return state;
}

export async function waitForReady(profile, pid, rawLogPath) {
  for (let i = 0; i < 180; i++) {
    if (await serverReady(profile.baseUrl)) return;
    if (pid && !pidAlive(pid)) {
      const tail = await readTail(rawLogPath, 120);
      throw new Error(`llama-server exited early. Last log lines:\n${tail}`);
    }
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for ${profile.baseUrl}/models`);
}

export async function stopProfile(profile) {
  const state = await readState(profile.id);
  if (!state?.pid) return { stopped: false, message: `No state pid for ${profile.id}.` };
  try {
    try {
      process.kill(-state.pid, "SIGTERM");
    } catch {
      process.kill(state.pid, "SIGTERM");
    }
    return { stopped: true, message: `Stopped ${profile.id} pid ${state.pid}` };
  } catch (error) {
    return { stopped: false, message: `Could not stop pid ${state.pid}: ${error.message}` };
  }
}

export async function isProfileRunning(profile) {
  const state = await readState(profile.id);
  return Boolean(state?.pid && pidAlive(state.pid));
}

export async function serverReady(baseUrl) {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/u, "")}/models`, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function timestampForFile() {
  return new Date().toISOString().replace(/[-:]/gu, "").replace(/\.\d+Z$/u, "Z");
}

function assertCommandReady(profile) {
  if (!existsSync(profile.commandPath)) throw new Error(`Missing command file: ${profile.commandPath}`);
  if (!profile.modelPath) throw new Error(`Command file is missing --model: ${profile.commandPath}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readTail(path, lines) {
  const text = await readFile(path, "utf8").catch(() => "");
  return text.split(/\r?\n/u).slice(-lines).join("\n");
}
