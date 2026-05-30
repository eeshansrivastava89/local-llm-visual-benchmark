import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, openSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildShellCommand } from "./command.mjs";
import { LOG_DIR } from "./paths.mjs";
import { ensureProfileCommand, readState, writeState } from "./profiles.mjs";
import { backendFor } from "./backends.mjs";
import { colors } from "./ui.mjs";

const execFileAsync = promisify(execFile);

export async function startServer(profile) {
  const backend = backendFor(profile.backend);
  if (backend.type === "managed-server") {
    return startManagedServer(profile, backend);
  }
  return startLocalServer(profile);
}

async function startLocalServer(profile) {
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

async function startManagedServer(profile, backend) {
  const ready = await serverReady(profile.baseUrl);
  if (ready) {
    console.log(colors.green(`[ready] ${backend.label} is already running at ${profile.baseUrl}`));
  } else {
    console.log(colors.yellow(`[waiting] ${backend.label} is not responding at ${profile.baseUrl}`));
    console.log(colors.dim(`Start it manually, then local-llm will verify readiness.`));
    // Wait for the user to start it
    for (let i = 0; i < 60; i++) {
      await sleep(2000);
      if (await serverReady(profile.baseUrl)) {
        console.log(colors.green(`[ready] ${backend.label} is responding at ${profile.baseUrl}`));
        break;
      }
      process.stdout.write(".");
    }
    if (!(await serverReady(profile.baseUrl))) {
      throw new Error(`${backend.label} is not responding at ${profile.baseUrl}. Start it and try again.`);
    }
  }
  const state = {
    pid: null,
    profileId: profile.id,
    baseUrl: profile.baseUrl,
    managedBy: backend.id,
    startedAt: new Date().toISOString()
  };
  await writeState(profile.id, state);
  return state;
}

export async function waitForReady(profile, pid, rawLogPath) {
  const backend = backendFor(profile.backend);
  if (backend.type === "managed-server") {
    // Managed servers are already verified in startServer
    return;
  }
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
  const backend = backendFor(profile.backend);
  if (backend.type === "managed-server") {
    // Managed servers are not stopped by local-llm
    const state = await readState(profile.id);
    await writeState(profile.id, { ...state, pid: null, stoppedAt: new Date().toISOString(), stopReason: "managed-server" });
    return { stopped: false, message: `${backend.label} is a managed service — local-llm does not stop it. Use the service's own controls.` };
  }

  const state = await readState(profile.id);
  if (!state?.pid) return { stopped: false, message: `No state pid for ${profile.id}.` };
  if (!pidAlive(state.pid)) {
    await writeState(profile.id, { ...state, pid: null, stoppedAt: new Date().toISOString(), stopReason: "pid-not-running" });
    return { stopped: false, message: `${profile.id} pid ${state.pid} is no longer running.` };
  }
  try {
    try {
      process.kill(-state.pid, "SIGTERM");
    } catch {
      process.kill(state.pid, "SIGTERM");
    }
    await writeState(profile.id, { ...state, pid: null, stoppedAt: new Date().toISOString(), stopSignal: "SIGTERM" });
    return { stopped: true, message: `Stopped ${profile.id} pid ${state.pid}` };
  } catch (error) {
    return { stopped: false, message: `Could not stop pid ${state.pid}: ${error.message}` };
  }
}

export async function isProfileRunning(profile) {
  const backend = backendFor(profile.backend);
  if (backend.type === "managed-server") {
    return await serverReady(profile.baseUrl);
  }
  const state = await readState(profile.id);
  return Boolean(state?.pid && pidAlive(state.pid));
}

export async function profileRuntimeStatus(profile) {
  const backend = backendFor(profile.backend);
  if (backend.type === "managed-server") {
    const ready = await serverReady(profile.baseUrl);
    return { state: null, pid: null, running: ready, ready, rssBytes: null, startedAt: null };
  }
  const state = await readState(profile.id);
  const running = Boolean(state?.pid && pidAlive(state.pid));
  const [ready, rssBytes] = await Promise.all([
    serverReady(profile.baseUrl),
    running ? pidRssBytes(state.pid) : Promise.resolve(null)
  ]);
  return { state, pid: state?.pid ?? null, running, ready, rssBytes, startedAt: state?.startedAt ? new Date(state.startedAt) : null };
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

async function pidRssBytes(pid) {
  try {
    const { stdout } = await execFileAsync("ps", ["-o", "rss=", "-p", String(pid)]);
    const rssKb = Number(stdout.trim().split(/\s+/u)[0]);
    return Number.isFinite(rssKb) ? rssKb * 1024 : null;
  } catch {
    return null;
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