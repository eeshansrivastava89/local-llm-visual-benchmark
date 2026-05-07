import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generateStaticExport } from "../../src/runner/export";
import type { RunMetadata } from "../../src/runner/types";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const execFileAsync = promisify(execFile);

async function createTempRoot(prefix: string) {
  return mkdtemp(join(tmpdir(), prefix));
}

async function writeBenchmark(directory: string) {
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "sakura.md"),
    `---
id: sakura
title: Sakura Particle Field
description: Animated sakura scene.
---

Create a sakura animation with layered petals.
`,
    "utf8"
  );
}

async function writeRun(runsRoot: string) {
  const runDirectory = join(
    runsRoot,
    "sakura",
    "local-qwen2-5-vl",
    "2026-05-06T19-12-00-000Z"
  );
  await mkdir(runDirectory, { recursive: true });
  const metadata: RunMetadata = {
    runId: "2026-05-06T19-12-00-000Z",
    benchmark: {
      id: "sakura",
      title: "Sakura Particle Field",
      description: "Animated sakura scene.",
      prompt: "Create a sakura animation with layered petals."
    },
    model: {
      id: "local/qwen2.5-vl",
      slug: "local-qwen2-5-vl"
    },
    status: "completed",
    createdAt: "2026-05-06T19:12:00.000Z",
    updatedAt: "2026-05-06T19:13:00.000Z",
    runDirectory,
    settings: {
      preview: {
        captureAtMs: 5000,
        viewport: {
          width: 1280,
          height: 720
        },
        video: false
      }
    },
    assets: {
      metadata: "metadata.json",
      prompt: "prompt.md",
      rawResponse: "response.raw.txt",
      html: "index.html",
      preview: "preview.png"
    },
    capture: {
      preview: {
        status: "ready",
        path: "preview.png",
        capturedAt: "2026-05-06T19:13:00.000Z"
      }
    }
  };

  await writeFile(join(runDirectory, "metadata.json"), JSON.stringify(metadata), "utf8");
  await writeFile(join(runDirectory, "prompt.md"), "prepared prompt", "utf8");
  await writeFile(join(runDirectory, "response.raw.txt"), "raw response", "utf8");
  await writeFile(join(runDirectory, "index.html"), "<!doctype html><html></html>", "utf8");
  await writeFile(join(runDirectory, "preview.png"), "png bytes", "utf8");
}

describe("generateStaticExport", () => {
  it("writes a manifest from benchmarks and saved runs with copied static assets", async () => {
    const root = await createTempRoot("llm-visual-export-");
    const benchmarkDirectory = join(root, "benchmarks");
    const runsRoot = join(root, "runs");
    const publicExportDirectory = join(root, "public", "export");
    await writeBenchmark(benchmarkDirectory);
    await writeRun(runsRoot);

    const manifest = await generateStaticExport({
      benchmarkDirectory,
      runsRoot,
      publicExportDirectory,
      generatedAt: new Date("2026-05-06T20:00:00.000Z")
    });

    expect(manifest).toMatchObject({
      version: 1,
      generatedAt: "2026-05-06T20:00:00.000Z",
      benchmarks: [
        {
          id: "sakura",
          title: "Sakura Particle Field",
          description: "Animated sakura scene.",
          prompt: "Create a sakura animation with layered petals."
        }
      ],
      runs: [
        {
          runId: "2026-05-06T19-12-00-000Z",
          runDirectory:
            "export/runs/sakura/local-qwen2-5-vl/2026-05-06T19-12-00-000Z",
          assets: {
            metadata: "metadata.json",
            prompt: "prompt.md",
            rawResponse: "response.raw.txt",
            html: "index.html",
            preview: "preview.png"
          }
        }
      ]
    });

    const rawManifest = await readFile(
      join(publicExportDirectory, "manifest.json"),
      "utf8"
    );
    expect(JSON.parse(rawManifest)).toEqual(manifest);
    await expect(
      readFile(
        join(
          publicExportDirectory,
          "runs",
          "sakura",
          "local-qwen2-5-vl",
          "2026-05-06T19-12-00-000Z",
          "preview.png"
        ),
        "utf8"
      )
    ).resolves.toBe("png bytes");
  });

  it("handles an empty saved runs directory", async () => {
    const root = await createTempRoot("llm-visual-export-empty-");
    const benchmarkDirectory = join(root, "benchmarks");
    const publicExportDirectory = join(root, "public", "export");
    await writeBenchmark(benchmarkDirectory);

    const manifest = await generateStaticExport({
      benchmarkDirectory,
      runsRoot: join(root, "missing-runs"),
      publicExportDirectory,
      generatedAt: new Date("2026-05-06T20:00:00.000Z")
    });

    expect(manifest.runs).toEqual([]);
    await expect(stat(join(publicExportDirectory, "manifest.json"))).resolves.toBeTruthy();
  });
});

describe("static build script", () => {
  it("simulates exported runs and produces a dist-static output", async () => {
    const root = await createTempRoot("llm-visual-static-build-");
    const benchmarkDirectory = join(root, "benchmarks");
    const runsRoot = join(root, "runs");
    const publicExportDirectory = join(root, "public-export");
    const staticOutputDirectory = join(root, "dist-static");
    await writeBenchmark(benchmarkDirectory);
    await writeRun(runsRoot);

    await execFileAsync("node", ["scripts/build-static.mjs"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        STATIC_BENCHMARK_DIR: benchmarkDirectory,
        STATIC_RUNS_ROOT: runsRoot,
        STATIC_EXPORT_DIR: publicExportDirectory,
        STATIC_OUTPUT_DIR: staticOutputDirectory
      }
    });

    await expect(stat(join(staticOutputDirectory, "index.html"))).resolves.toBeTruthy();
    await expect(
      readFile(join(staticOutputDirectory, "export", "manifest.json"), "utf8")
    ).resolves.toContain("2026-05-06T19-12-00-000Z");
  });
});
