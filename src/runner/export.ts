import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { join, posix } from "node:path";
import { loadBenchmarks } from "./benchmarks.ts";
import { listRunMetadata } from "./runs.ts";
import type { BenchmarkRecord, RunMetadata } from "./types.ts";

export interface StaticExportManifest {
  version: 1;
  generatedAt: string;
  benchmarks: BenchmarkRecord[];
  runs: RunMetadata[];
}

export interface GenerateStaticExportOptions {
  benchmarkDirectory?: string;
  runsRoot?: string;
  publicExportDirectory?: string;
  generatedAt?: Date;
}

const DEFAULT_BENCHMARK_DIRECTORY = join(process.cwd(), "benchmarks");
const DEFAULT_RUNS_ROOT = join(process.cwd(), "runs");
const DEFAULT_PUBLIC_EXPORT_DIRECTORY = join(process.cwd(), "public", "export");
const EXPORTED_RUNS_DIRECTORY = "runs";

export async function generateStaticExport(
  options: GenerateStaticExportOptions = {}
): Promise<StaticExportManifest> {
  const benchmarkDirectory =
    options.benchmarkDirectory ?? DEFAULT_BENCHMARK_DIRECTORY;
  const runsRoot = options.runsRoot ?? DEFAULT_RUNS_ROOT;
  const publicExportDirectory =
    options.publicExportDirectory ?? DEFAULT_PUBLIC_EXPORT_DIRECTORY;

  await rm(publicExportDirectory, { recursive: true, force: true });
  await mkdir(publicExportDirectory, { recursive: true });

  const [benchmarks, runs] = await Promise.all([
    loadBenchmarks(benchmarkDirectory),
    listRunMetadata(runsRoot)
  ]);
  const exportedRuns = await Promise.all(
    runs.map((run) => exportRunAssets(run, publicExportDirectory))
  );
  const manifest: StaticExportManifest = {
    version: 1,
    generatedAt: (options.generatedAt ?? new Date()).toISOString(),
    benchmarks: benchmarks.map(toStaticBenchmark),
    runs: exportedRuns
  };

  await writePrettyJson(join(publicExportDirectory, "manifest.json"), manifest);
  return manifest;
}

async function exportRunAssets(
  run: RunMetadata,
  publicExportDirectory: string
): Promise<RunMetadata> {
  const exportRunDirectory = posix.join(
    "export",
    EXPORTED_RUNS_DIRECTORY,
    run.benchmark.id,
    run.model.slug,
    run.runId
  );
  const outputDirectory = join(
    publicExportDirectory,
    EXPORTED_RUNS_DIRECTORY,
    run.benchmark.id,
    run.model.slug,
    run.runId
  );
  const assets = {
    ...run.assets,
    metadata: run.assets.metadata ?? "metadata.json"
  };
  const exportedRun: RunMetadata = {
    ...run,
    benchmark: toStaticBenchmark(run.benchmark),
    runDirectory: exportRunDirectory,
    assets
  };

  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writePrettyJson(join(outputDirectory, assets.metadata), exportedRun),
    copyAssetIfPresent(run, outputDirectory, assets.prompt),
    copyAssetIfPresent(run, outputDirectory, assets.rawResponse),
    copyAssetIfPresent(run, outputDirectory, assets.html),
    copyAssetIfPresent(run, outputDirectory, assets.preview),
    copyAssetIfPresent(run, outputDirectory, assets.video)
  ]);

  return exportedRun;
}

async function copyAssetIfPresent(
  run: RunMetadata,
  outputDirectory: string,
  asset?: string
): Promise<void> {
  if (!asset) {
    return;
  }

  try {
    await copyFile(join(run.runDirectory, asset), join(outputDirectory, asset));
  } catch (error) {
    if (isMissingPathError(error)) {
      return;
    }

    throw error;
  }
}

function toStaticBenchmark(benchmark: BenchmarkRecord): BenchmarkRecord {
  return {
    id: benchmark.id,
    title: benchmark.title,
    description: benchmark.description,
    prompt: benchmark.prompt
  };
}

async function writePrettyJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const manifest = await generateStaticExport();
  process.stdout.write(
    `Wrote static export manifest with ${manifest.benchmarks.length} benchmarks and ${manifest.runs.length} runs.\n`
  );
}
