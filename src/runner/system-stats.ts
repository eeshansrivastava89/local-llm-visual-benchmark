import {
  arch,
  cpus,
  freemem,
  hostname,
  platform,
  release,
  totalmem,
  type,
  uptime
} from "node:os";
import { execFileSync } from "node:child_process";

export interface SystemStats {
  collectedAt: string;
  platform: {
    node: string;
    platform: NodeJS.Platform;
    arch: string;
  };
  os: {
    type: string;
    release: string;
    hostname: string;
    uptimeSeconds: number;
  };
  cpu: {
    model: string;
    cores: number;
    usagePercent: number | null;
  };
  memory: {
    totalBytes: number;
    availableBytes: number;
    freeBytes: number;
    usedBytes: number;
    pressurePercent: number | null;
    pressureLabel: "low" | "medium" | "high" | "unknown";
    source: string;
  };
  gpu: {
    available: boolean;
    telemetryAvailable: boolean;
    devices: Array<{
      name: string;
      cores?: string;
      vendor?: string;
    }>;
    reason: string;
  };
}

interface CpuSample {
  idle: number;
  total: number;
}

let previousCpuSample: CpuSample | undefined;
let cachedGpuInfo: SystemStats["gpu"] | undefined;

export function getSystemStats(now = new Date()): SystemStats {
  const cpuRecords = cpus();
  const memory = getMemoryStats();
  const cpuSample = readCpuSample();
  const usagePercent = calculateCpuUsagePercent(previousCpuSample, cpuSample);
  previousCpuSample = cpuSample;

  return {
    collectedAt: now.toISOString(),
    platform: {
      node: process.version,
      platform: platform(),
      arch: arch()
    },
    os: {
      type: type(),
      release: release(),
      hostname: hostname(),
      uptimeSeconds: uptime()
    },
    cpu: {
      model: readCpuModel() ?? cpuRecords[0]?.model ?? "unknown",
      cores: cpuRecords.length,
      usagePercent
    },
    memory,
    gpu: getGpuInfo()
  };
}

function readCpuSample(): CpuSample {
  return cpus().reduce<CpuSample>(
    (accumulator, cpu) => {
      const idle = cpu.times.idle;
      const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
      return {
        idle: accumulator.idle + idle,
        total: accumulator.total + total
      };
    },
    { idle: 0, total: 0 }
  );
}

function calculateCpuUsagePercent(
  previous: CpuSample | undefined,
  current: CpuSample
): number | null {
  if (!previous) {
    return null;
  }

  const idleDelta = current.idle - previous.idle;
  const totalDelta = current.total - previous.total;
  if (totalDelta <= 0) {
    return null;
  }

  return clampPercent(((totalDelta - idleDelta) / totalDelta) * 100);
}

function getMemoryStats(): SystemStats["memory"] {
  if (platform() === "darwin") {
    const macStats = getMacMemoryStats();
    if (macStats) {
      return macStats;
    }
  }

  const totalBytes = totalmem();
  const freeBytes = freemem();
  const usedBytes = totalBytes - freeBytes;
  return {
    totalBytes,
    availableBytes: freeBytes,
    freeBytes,
    usedBytes,
    pressurePercent: clampPercent((usedBytes / totalBytes) * 100),
    pressureLabel: pressureLabel((usedBytes / totalBytes) * 100),
    source: "Node total memory minus free memory"
  };
}

function getMacMemoryStats(): SystemStats["memory"] | undefined {
  const output = runCommand("vm_stat");
  if (!output) {
    return undefined;
  }

  const pageSizeMatch = output.match(/page size of (\d+) bytes/i);
  const pageSize = pageSizeMatch ? Number.parseInt(pageSizeMatch[1], 10) : 4096;
  const pages = {
    free: readVmStatPages(output, "Pages free"),
    active: readVmStatPages(output, "Pages active"),
    inactive: readVmStatPages(output, "Pages inactive"),
    speculative: readVmStatPages(output, "Pages speculative"),
    wired: readVmStatPages(output, "Pages wired down"),
    purgeable: readVmStatPages(output, "Pages purgeable"),
    compressor: readVmStatPages(output, "Pages occupied by compressor")
  };
  const totalBytes = totalmem();
  const freeBytes = pages.free * pageSize;
  const availableBytes =
    (pages.free + pages.inactive + pages.speculative + pages.purgeable) * pageSize;
  const usedBytes = Math.max(0, totalBytes - Math.min(totalBytes, availableBytes));
  const pressurePercent = clampPercent((usedBytes / totalBytes) * 100);

  return {
    totalBytes,
    availableBytes: Math.min(totalBytes, availableBytes),
    freeBytes,
    usedBytes,
    pressurePercent,
    pressureLabel: pressureLabel(pressurePercent),
    source: "macOS VM stats, cached and purgeable memory excluded"
  };
}

function readVmStatPages(output: string, label: string): number {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = output.match(new RegExp(`${escaped}:\\s+(\\d+)\\.`, "i"));
  return match ? Number.parseInt(match[1], 10) : 0;
}

function getGpuInfo(): SystemStats["gpu"] {
  cachedGpuInfo ??= detectGpuInfo();
  return cachedGpuInfo;
}

function detectGpuInfo(): SystemStats["gpu"] {
  const profilerOutput =
    platform() === "darwin"
      ? runCommand("system_profiler", ["SPDisplaysDataType", "-json"], 2500)
      : undefined;

  if (profilerOutput) {
    try {
      const parsed = JSON.parse(profilerOutput) as {
        SPDisplaysDataType?: Array<Record<string, unknown>>;
      };
      const devices = (parsed.SPDisplaysDataType ?? [])
        .map((device) => ({
          name: String(device.sppci_model ?? device._name ?? "GPU"),
          cores:
            typeof device.sppci_cores === "string"
              ? device.sppci_cores
              : undefined,
          vendor:
            typeof device.spdisplays_vendor === "string"
              ? device.spdisplays_vendor
              : undefined
        }))
        .filter((device) => device.name !== "GPU");

      if (devices.length > 0) {
        return {
          available: true,
          telemetryAvailable: false,
          devices,
          reason:
            "GPU hardware detected. Live GPU utilization is not available from the local API v1."
        };
      }
    } catch {
      // Fall through to the generic unavailable state.
    }
  }

  return {
    available: false,
    telemetryAvailable: false,
    devices: [],
    reason: "GPU hardware telemetry is unavailable in the local API v1."
  };
}

function readCpuModel(): string | undefined {
  return runCommand("sysctl", ["-n", "machdep.cpu.brand_string"])?.trim();
}

function runCommand(
  command: string,
  args: string[] = [],
  timeout = 1000
): string | undefined {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      timeout,
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return undefined;
  }
}

function pressureLabel(percent: number): SystemStats["memory"]["pressureLabel"] {
  if (!Number.isFinite(percent)) {
    return "unknown";
  }
  if (percent >= 90) {
    return "high";
  }
  if (percent >= 75) {
    return "medium";
  }
  return "low";
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Number(value.toFixed(1))));
}
