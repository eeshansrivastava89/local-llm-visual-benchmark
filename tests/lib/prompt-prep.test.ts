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
    expect(prepared.prompt).toContain(prepared.paths.htmlPath);
    expect(prepared.prompt).toContain("one complete self-contained HTML document");
    expect(prepared.prompt).not.toContain("screenshot");
    expect(prepared.prompt).not.toContain("preview.png");
    await expect(stat(prepared.paths.runDirectory)).resolves.toBeTruthy();
    await expect(readFile(prepared.paths.promptPath, "utf8")).resolves.toBe(
      prepared.prompt
    );
    await expect(readFile(prepared.paths.metadataPath, "utf8")).resolves.toContain(
      "\"status\": \"prepared\""
    );
  });
});
