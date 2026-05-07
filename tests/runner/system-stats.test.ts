import { describe, expect, it } from "vitest";
import { getSystemStats } from "../../src/runner/system-stats";

describe("getSystemStats", () => {
  it("returns best-effort local OS, CPU, RAM, platform, and GPU placeholder stats", () => {
    const stats = getSystemStats(new Date("2026-05-06T12:00:00.000Z"));

    expect(stats).toMatchObject({
      collectedAt: "2026-05-06T12:00:00.000Z",
      platform: {
        node: expect.any(String),
        platform: expect.any(String),
        arch: expect.any(String)
      },
      os: {
        type: expect.any(String),
        release: expect.any(String),
        hostname: expect.any(String)
      },
      cpu: {
        model: expect.any(String),
        cores: expect.any(Number),
        loadAverage: expect.any(Array)
      },
      memory: {
        totalBytes: expect.any(Number),
        freeBytes: expect.any(Number),
        usedBytes: expect.any(Number)
      },
      gpu: {
        available: false,
        devices: [],
        reason: expect.any(String)
      }
    });
    expect(stats.cpu.cores).toBeGreaterThan(0);
    expect(stats.memory.totalBytes).toBeGreaterThanOrEqual(stats.memory.freeBytes);
    expect(stats.memory.usedBytes).toBe(
      stats.memory.totalBytes - stats.memory.freeBytes
    );
  });
});
