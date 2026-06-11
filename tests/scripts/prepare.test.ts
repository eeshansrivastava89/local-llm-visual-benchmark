import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildToolPrompt } from "../../src/lib/prompt-prep";
import { loadBenchmarks } from "../../src/lib/benchmarks";

const BENCHMARKS = join(import.meta.dirname, "..", "..", "benchmarks");

describe("buildToolPrompt", () => {
  const visualBenchmark = {
    id: "sakura",
    title: "Sakura Tree",
    description: "Cherry blossom animation.",
    prompt: "Animate a cherry blossom tree.",
    sourcePath: "",
  };

  const dsBenchmark = {
    id: "ab-test-analysis",
    title: "A/B Test Analysis",
    description: "Analyze the A/B test.",
    prompt: "Analyze the A/B test data from Supabase.",
    sourcePath: "",
  };

  it("builds a visual prompt with HTML instructions", () => {
    const prompt = buildToolPrompt({
      benchmark: visualBenchmark,
      kind: "visual",
    });
    expect(prompt).toContain("Create a complete, self-contained HTML file");
    expect(prompt).toContain("Write the file as `index.html`");
    expect(prompt).toContain("Animate a cherry blossom tree.");
    expect(prompt).toContain("visual QA pass");
  });

  it("builds a data-science prompt as-is (no HTML wrapper)", () => {
    const prompt = buildToolPrompt({
      benchmark: dsBenchmark,
      kind: "data-science",
    });
    expect(prompt).not.toContain("Create a complete, self-contained HTML file");
    expect(prompt).toContain("Analyze the A/B test data from Supabase.");
  });
});

describe("loadBenchmarks", () => {
  it("loads benchmarks from the project benchmarks directory", async () => {
    const benchmarks = await loadBenchmarks(BENCHMARKS);
    expect(benchmarks.length).toBeGreaterThan(0);
    const sakura = benchmarks.find((b) => b.id === "sakura");
    expect(sakura).toBeDefined();
    if (sakura) {
      expect(sakura.title).toBe("Sakura Tree");
      expect(sakura.prompt).toContain("cherry blossom");
    }
  });

  it("loads ab-test-analysis benchmark", async () => {
    const benchmarks = await loadBenchmarks(BENCHMARKS);
    const ab = benchmarks.find((b) => b.id === "ab-test-analysis");
    expect(ab).toBeDefined();
    if (ab) {
      expect(ab.title).toBeTruthy();
      expect(ab.prompt).toContain("Supabase");
    }
  });
});