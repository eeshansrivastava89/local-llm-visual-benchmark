import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LLAMA_CPP_BASE_URL,
  prepareRun
} from "../../src/lib/prompt-prep";
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
    expect(prepared.prompt).toContain(prepared.paths.htmlPath);
    expect(prepared.prompt).toContain("Do not print the HTML in chat");
    expect(prepared.prompt).toContain("Write the file directly to this exact path");
    expect(prepared.prompt).toContain("1280x720 capture viewport");
    expect(prepared.prompt).toContain("fully visible and centered");
    expect(prepared.prompt).toContain("Animate a cherry blossom tree.");
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

  it("snapshots an editable llama.cpp command into metadata and command.txt", async () => {
    const runsRoot = await mkdtemp(join(tmpdir(), "viewer-prep-llama-runs-"));
    const command = "llama-server -m /models/test.gguf --port 8080 --n-gpu-layers 999";
    const prepared = await prepareRun({
      benchmark,
      modelId: "local/test.gguf",
      runner: "llama-cpp",
      baseUrl: DEFAULT_LLAMA_CPP_BASE_URL,
      launchCommand: command,
      runsRoot,
      now: new Date("2026-05-07T04:00:32.122Z")
    });

    expect(prepared.command).toBe(command);
    expect(prepared.run).toMatchObject({
      kind: "visual",
      runner: {
        mode: "openai-compatible",
        intendedRunner: "llama.cpp",
        backendLabel: "llama.cpp",
        baseUrl: DEFAULT_LLAMA_CPP_BASE_URL,
        launchCommand: command,
        commandAsset: "command.txt"
      },
      assets: {
        command: "command.txt"
      }
    });
    await expect(readFile(prepared.paths.commandPath, "utf8")).resolves.toBe(command + "\n");
  });

  it("replaces prepared run placeholders in supplied commands", async () => {
    const runsRoot = await mkdtemp(join(tmpdir(), "viewer-prep-command-placeholder-runs-"));
    const prepared = await prepareRun({
      benchmark,
      modelId: "local-model",
      runner: "llama-cpp",
      launchCommand: "llama-server -m /models/test.gguf --run-folder <prepared-run-folder>",
      runsRoot,
      now: new Date("2026-05-07T04:00:32.122Z")
    });

    expect(prepared.command).toContain("--run-folder " + prepared.paths.runDirectory);
    expect(prepared.command).not.toContain("<prepared-run-folder>");
    await expect(readFile(prepared.paths.commandPath, "utf8")).resolves.toBe(prepared.command + "\n");
  });

  it("uses the Apple Silicon llama.cpp default when no command is supplied", async () => {
    const runsRoot = await mkdtemp(join(tmpdir(), "viewer-prep-llama-default-runs-"));
    const prepared = await prepareRun({
      benchmark,
      modelId: "local/test.gguf",
      runner: "llama-cpp",
      runsRoot
    });

    expect(prepared.command).toContain("llama-server");
    expect(prepared.command).toContain("-m");
  });
});
