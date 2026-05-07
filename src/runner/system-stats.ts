import {
  arch,
  cpus,
  freemem,
  hostname,
  loadavg,
  platform,
  release,
  totalmem,
  type,
  uptime
} from "node:os";

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
    loadAverage: number[];
  };
  memory: {
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
  };
  gpu: {
    available: false;
    devices: [];
    reason: string;
  };
}

export function getSystemStats(now = new Date()): SystemStats {
  const cpuRecords = cpus();
  const totalBytes = totalmem();
  const freeBytes = freemem();

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
      model: cpuRecords[0]?.model ?? "unknown",
      cores: cpuRecords.length,
      loadAverage: loadavg()
    },
    memory: {
      totalBytes,
      freeBytes,
      usedBytes: totalBytes - freeBytes
    },
    gpu: {
      available: false,
      devices: [],
      reason: "GPU telemetry is unavailable in the local API v1."
    }
  };
}
