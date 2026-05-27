import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { prepareRun } from "../../src/lib/prompt-prep";
import type { BenchmarkRecord } from "../../src/lib/types";

const benchmark: BenchmarkRecord = {
  id: "sakura",
  title: "Sakura Tree",
  description: "Dreamy cherry blossom animation.",
  prompt: "Animate a cherry blossom tree."
};

describe("prepareRun", () => {
  it("creates a prepared run folder with metadata and a tool-agnostic prompt", async () => {
    const runsRoot = await mkdtemp(join(tmpdir(), "viewer-prep-runs-"));
    const prepared = await prepareRun({
      benchmark,
      modelId: "google/gemma-4-e4b",
      runsRoot,
      now: new Date("2026-05-07T04:00:32.122Z")
    });

    expect(prepared.run).toMatchObject({
      runId: "2026-05-07T04-00-32-122Z",
      status: "prepared",
      model: {
        id: "google/gemma-4-e4b"
      },
      assets: {
        metadata: "metadata.json",
        prompt: "prompt.md",
        html: "index.html",
        preview: "preview.png"
      }
    });
    expect(prepared.prompt).not.toContain("OpenCode");
    expect(prepared.prompt).not.toContain("Pi");
    expect(prepared.prompt).not.toContain("Model label:");
    expect(prepared.prompt).not.toContain("Benchmark:");
    expect(prepared.prompt).not.toContain("Run folder:");
    expect(prepared.prompt).not.toContain("Output contract:");
    expect(prepared.prompt).not.toContain(prepared.paths.htmlPath);
    expect(prepared.prompt).not.toContain(prepared.paths.runDirectory);
    expect(prepared.prompt).toContain("Write the file as `index.html` in the current working directory");
    expect(prepared.prompt).toContain("Do not create any folders");
    expect(prepared.prompt).toContain("do not print the HTML in chat");
    expect(prepared.prompt).not.toContain("1280x720");
    expect(prepared.prompt).not.toContain("agent-browser path:");
    expect(prepared.prompt).toContain("run a visual QA pass with agent-browser or Playwright");
    expect(prepared.prompt).toContain("open the saved index.html");
    expect(prepared.prompt).toContain("Playwright");
    expect(prepared.prompt).toContain("Animate a cherry blossom tree.");
    expect(prepared.prompt).not.toContain("preview.png");
    await expect(stat(prepared.paths.runDirectory)).resolves.toBeTruthy();
    await expect(readFile(prepared.paths.promptPath, "utf8")).resolves.toBe(
      prepared.prompt
    );
    await expect(readFile(prepared.paths.metadataPath, "utf8")).resolves.toContain(
      "\"status\": \"prepared\""
    );
  });

  it("records custom model source metadata for manual cloud runs", async () => {
    const runsRoot = await mkdtemp(join(tmpdir(), "viewer-prep-custom-runs-"));
    const prepared = await prepareRun({
      benchmark,
      modelId: "ChatGPT",
      modelSource: "custom",
      backendLabel: "cloud",
      runner: "manual",
      runsRoot,
      now: new Date("2026-05-07T04:00:32.122Z")
    });

    expect(prepared.run).toMatchObject({
      model: {
        id: "ChatGPT",
        slug: "chatgpt"
      },
      runner: {
        mode: "manual",
        modelSource: "custom",
        intendedRunner: "manual",
        backendLabel: "cloud",
        model: "ChatGPT"
      }
    });
  });

  it("records model source and harness metadata without command artifacts", async () => {
    const runsRoot = await mkdtemp(join(tmpdir(), "viewer-prep-omlx-runs-"));
    const prepared = await prepareRun({
      benchmark,
      modelId: "Qwen3.6-35B-A3B-4bit",
      modelSource: "omlx",
      runner: "opencode",
      baseUrl: "http://127.0.0.1:8000/v1",
      runsRoot,
      now: new Date("2026-05-07T04:00:32.122Z")
    });

    expect(prepared.command).toBeUndefined();
    expect(prepared.run).toMatchObject({
      kind: "visual",
      tool: "opencode",
      runner: {
        mode: "external",
        modelSource: "omlx",
        intendedRunner: "OpenCode",
        backendLabel: "oMLX",
        baseUrl: "http://127.0.0.1:8000/v1"
      }
    });
    expect(prepared.run.assets.command).toBeUndefined();
    await expect(readFile(prepared.paths.metadataPath, "utf8")).resolves.toContain(
      "\"modelSource\": \"omlx\""
    );
  });

  it("prepares data-science runs with DS assets and raw prompt", async () => {
    const runsRoot = await mkdtemp(join(tmpdir(), "viewer-prep-ds-runs-"));
    const dsBenchmark: BenchmarkRecord = {
      id: "ab-test-analysis",
      title: "A/B Test Production Analysis",
      description: "Analyze the A/B test.",
      prompt: "Analyze the A/B test data from Supabase."
    };
    const prepared = await prepareRun({
      benchmark: dsBenchmark,
      modelId: "qwen3-30b-a3b",
      kind: "data-science",
      runsRoot,
      now: new Date("2026-05-26T04:00:32.122Z")
    });

    expect(prepared.run).toMatchObject({
      kind: "data-science",
      assets: {
        metadata: "metadata.json",
        prompt: "prompt.md",
        ds: {
          notebook: "analysis.ipynb",
          summary: "summary.json",
          chartDistribution: "chart-distribution.png",
          chartTreatmentEffect: "chart-treatment-effect.png",
          chartCompletionRates: "chart-completion-rates.png"
        }
      }
    });
    expect(prepared.prompt).not.toContain("Write the file as `index.html`");
    expect(prepared.prompt).toContain("Analyze the A/B test data from Supabase.");
    expect(prepared.run.assets.html).toBeUndefined();
    expect(prepared.run.assets.preview).toBeUndefined();
  });
});
