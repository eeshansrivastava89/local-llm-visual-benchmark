import { execFile } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { DsJudgeScorecard, DsScorecard, RunMetadata } from "./types";

const execFileAsync = promisify(execFile);
const DEFAULT_JUDGE_MODEL = "ollama-cloud/glm-5.1";

export interface ScoreDsRunOptions {
  runsRoot: string;
  runDirectory: string;
  judgeModel?: string;
  /** Skip Layer 2 (LLM judge). Default false. Set true for fast deterministic-only scoring. */
  skipJudge?: boolean;
}

export interface ScoreDsRunResult {
  scored: boolean;
  run: RunMetadata;
  layer1?: {
    scorecard: DsScorecard;
  };
  layer2?: {
    judgeScorecard: DsJudgeScorecard;
  };
}

export async function scoreDsRun(
  options: ScoreDsRunOptions,
  deps?: {
    execFile?: typeof execFileAsync;
    readFile?: typeof readFile;
    writeFile?: typeof writeFile;
    stat?: typeof stat;
  }
): Promise<ScoreDsRunResult> {
  const exec = deps?.execFile ?? execFileAsync;
  const readFileFn = deps?.readFile ?? readFile;
  const writeFileFn = deps?.writeFile ?? writeFile;
  const statFn = deps?.stat ?? stat;

  const runsRoot = resolve(options.runsRoot);
  const runDirectory = resolve(options.runDirectory);

  // Validate directory is inside runs root
  if (!runDirectory.startsWith(runsRoot + "/") && runDirectory !== runsRoot) {
    throw new Error("Run directory is outside the configured runs folder.");
  }

  // Read metadata
  const metadataPath = join(runDirectory, "metadata.json");
  let metadata: RunMetadata;
  try {
    metadata = JSON.parse(await readFileFn(metadataPath, "utf8"));
  } catch {
    throw new Error("metadata.json not found or unreadable in run directory.");
  }

  // Must be a data-science run
  if (metadata.kind !== "data-science") {
    throw new Error("Not a data-science run. Scoring is only available for data-science runs.");
  }

  // Check summary.json exists (Layer 1 needs it)
  const summaryPath = join(runDirectory, "summary.json");
  try {
    await statFn(summaryPath);
  } catch {
    throw new Error("summary.json not found. The model must produce summary.json before scoring.");
  }

  console.log(`[score-ds] Starting scoring for ${runDirectory}`);
  console.log(`[score-ds] Run kind: ${metadata.kind}, model: ${metadata.model?.id ?? "unknown"}, benchmark: ${metadata.benchmark?.id ?? "unknown"}`);

  const timestamp = new Date().toISOString();
  let layer1: ScoreDsRunResult["layer1"];
  let layer2: ScoreDsRunResult["layer2"];

  // Layer 1: run deterministic scorer
  console.log("[score-ds] Layer 1: running deterministic scorer (score-ds-run.py)...");
  try {
    const scorecard = await runLayer1(exec, runDirectory);
    layer1 = { scorecard };
    console.log(`[score-ds] Layer 1 complete: ${scorecard.earned}/${scorecard.total} (${scorecard.pct}%)`);
    // Write scorecard.json to disk
    const scorecardPath = join(runDirectory, metadata.assets?.ds?.scorecard ?? "scorecard.json");
    await writeFileFn(scorecardPath, JSON.stringify(scorecard, null, 2) + "\n", "utf8");
    console.log(`[score-ds] Layer 1 scorecard written to ${scorecardPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[score-ds] Layer 1 failed:", message);
    throw new Error("Layer 1 scoring failed: " + message);
  }

  // Layer 2: run LLM-as-judge (unless skipped)
  if (!options.skipJudge) {
    const model = options.judgeModel ?? process.env.DS_JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL;
    console.log(`[score-ds] Layer 2: running LLM judge (model: ${model})...`);
    console.log("[score-ds] Layer 2: pi will read artifacts from the run directory and write scorecard-judge.json");
    try {
      const judgeScorecard = await runLayer2(exec, runDirectory, options.judgeModel, readFileFn);
      layer2 = { judgeScorecard };
      const avg = (judgeScorecard.notebook_structure + judgeScorecard.visualization_quality + judgeScorecard.statistical_interpretation + judgeScorecard.grounding + judgeScorecard.product_recommendation) / 5;
      console.log(`[score-ds] Layer 2 complete: avg ${avg.toFixed(1)}/10 (structure=${judgeScorecard.notebook_structure} viz=${judgeScorecard.visualization_quality} stats=${judgeScorecard.statistical_interpretation} grounding=${judgeScorecard.grounding} rec=${judgeScorecard.product_recommendation})`);
    } catch (error) {
      // Layer 2 failure is non-fatal — Layer 1 result is still valid
      console.error("[score-ds] Layer 2 (LLM judge) failed:", error instanceof Error ? error.message : error);
    }
  } else {
    console.log("[score-ds] Layer 2: skipped (skipJudge=true)");
  }

  // Update metadata
  const nextAssets = {
    ...metadata.assets,
    ds: {
      ...metadata.assets?.ds,
      scorecard: metadata.assets?.ds?.scorecard ?? "scorecard.json",
      ...(layer2 ? { judgeScorecard: metadata.assets?.ds?.judgeScorecard ?? "scorecard-judge.json" } : {})
    }
  };

  const next: RunMetadata = {
    ...metadata,
    status: "completed",
    completedAt: timestamp,
    updatedAt: timestamp,
    failedAt: undefined,
    error: undefined,
    assets: nextAssets,
    dsScorecard: layer1.scorecard,
    ...(layer2 ? { dsJudgeScorecard: layer2.judgeScorecard } : {})
  };

  await writeFileFn(metadataPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  console.log("[score-ds] metadata.json updated. Scoring complete.");

  return {
    scored: true,
    run: next,
    layer1,
    layer2
  };
}

async function runLayer1(
  exec: typeof execFileAsync,
  runDirectory: string
): Promise<DsScorecard> {
  const scorerPath = resolve(process.cwd(), "scripts/score-ds-run.py");
  console.log(`[score-ds] Layer 1 command: python3 ${scorerPath} ${runDirectory}`);
  const { stdout } = await exec("python3", [scorerPath, runDirectory], {
    timeout: 30_000
  });

  try {
    const parsed = JSON.parse(stdout);
    if (typeof parsed.earned !== "number" || typeof parsed.total !== "number") {
      throw new Error("Scorer output missing earned/total fields.");
    }
    return {
      layer: parsed.layer ?? 1,
      total: parsed.total,
      earned: parsed.earned,
      pct: parsed.pct ?? Math.round(parsed.earned / parsed.total * 1000) / 10,
      checks: typeof parsed.checks === "object" ? parsed.checks : undefined
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Layer 1 scorer produced invalid JSON: " + stdout.slice(0, 200));
    }
    throw error;
  }
}

async function runLayer2(
  exec: typeof execFileAsync,
  runDirectory: string,
  judgeModel: string | undefined,
  readFileFn: typeof readFile
): Promise<DsJudgeScorecard> {
  const model = judgeModel ?? process.env.DS_JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL;
  const judgePromptPath = resolve(process.cwd(), "scripts/judge/llm-judge-prompt.md");

  // Run pi in print mode with read+write tools, in the run directory
  // The model reads the artifacts from CWD and writes scorecard-judge.json
  console.log(`[score-ds] Layer 2 command: pi -p --tools read,write --model ${model} @${judgePromptPath}`);
  console.log(`[score-ds] Layer 2 cwd: ${runDirectory}`);
  const startTime = Date.now();
  const { stdout, stderr } = await exec(
    "pi",
    ["-p", "--tools", "read,write", "--model", model, "@" + judgePromptPath],
    {
      cwd: runDirectory,
      timeout: 600_000
    }
  );
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[score-ds] Layer 2 pi finished in ${elapsed}s`);

  // Check if scorecard-judge.json was written
  const judgePath = join(runDirectory, "scorecard-judge.json");
  try {
    const raw = await readFileFn(judgePath, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.notebook_structure !== "number") {
      throw new Error("Judge scorecard missing notebook_structure field.");
    }
    return {
      notebook_structure: parsed.notebook_structure,
      visualization_quality: parsed.visualization_quality ?? 0,
      statistical_interpretation: parsed.statistical_interpretation ?? 0,
      grounding: parsed.grounding ?? 0,
      product_recommendation: parsed.product_recommendation ?? 0,
      notes: typeof parsed.notes === "string" ? parsed.notes : ""
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      "LLM judge did not produce a valid scorecard-judge.json. " +
      "pi stdout: " + (stdout || "(empty)").slice(0, 500) + ". " +
      "pi stderr: " + (stderr || "(empty)").slice(0, 500) + ". " +
      "Read error: " + message
    );
  }
}