import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildRunPaths } from "../../src/runner/paths";
import {
  extractHtmlDocument,
  writeExtractedHtmlRun
} from "../../src/runner/extract-html";
import { writeRunMetadata } from "../../src/runner/runs";
import type { RunMetadata } from "../../src/runner/types";

const CLEAN_HTML = `<!doctype html>
<html>
  <head><title>Visual Benchmark</title></head>
  <body><main>Hello</main></body>
</html>`;

async function createRunsRoot() {
  return mkdtemp(join(tmpdir(), "llm-visual-extract-"));
}

function createMetadata(runDirectory: string): RunMetadata {
  return {
    runId: "2026-05-06T01-02-03-004Z",
    benchmark: {
      id: "sakura",
      title: "Sakura Tree",
      description: "Dreamy cherry blossom animation.",
      prompt: "Animate a cherry blossom tree."
    },
    model: {
      id: "lmstudio-community/Qwen2.5 Coder:7B Instruct",
      slug: "lmstudio-community-qwen2-5-coder-7b-instruct-1234567890"
    },
    status: "running",
    createdAt: "2026-05-06T01:02:03.004Z",
    updatedAt: "2026-05-06T01:02:04.004Z",
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
      rawResponse: "response.raw.txt",
      html: "index.html"
    }
  };
}

describe("extractHtmlDocument", () => {
  it("extracts a clean complete HTML document", () => {
    expect(extractHtmlDocument(CLEAN_HTML)).toBe(CLEAN_HTML);
  });

  it("extracts a fenced html block", () => {
    const raw = `Here is the answer:

\`\`\`html
${CLEAN_HTML}
\`\`\``;

    expect(extractHtmlDocument(raw)).toBe(CLEAN_HTML);
  });

  it("extracts a document from messy surrounding text", () => {
    const raw = `Sure, here is a complete page.

${CLEAN_HTML}

This should render well.`;

    expect(extractHtmlDocument(raw)).toBe(CLEAN_HTML);
  });

  it("fails clearly when no HTML document exists", () => {
    expect(() => extractHtmlDocument("I cannot produce that page.")).toThrow(
      /no html document/i
    );
  });

  it("fails malformed HTML that is missing required document markers", () => {
    expect(() => extractHtmlDocument("<html><body>Missing metadata</body></html>")).toThrow(
      /missing required html document markers/i
    );
  });
});

describe("writeExtractedHtmlRun", () => {
  it("writes the raw response before extraction fails", async () => {
    const runsRoot = await createRunsRoot();
    const paths = buildRunPaths({
      runsRoot,
      benchmarkId: "sakura",
      modelId: "lmstudio-community/Qwen2.5 Coder:7B Instruct",
      runId: "2026-05-06T01-02-03-004Z"
    });
    await writeRunMetadata(paths, createMetadata(paths.runDirectory));

    await expect(
      writeExtractedHtmlRun(paths, "not html", {
        now: new Date("2026-05-06T01:02:05.004Z")
      })
    ).rejects.toThrow(/no html document/i);

    await expect(readFile(paths.rawResponsePath, "utf8")).resolves.toBe("not html");
  });

  it("writes successful extraction to index.html", async () => {
    const runsRoot = await createRunsRoot();
    const paths = buildRunPaths({
      runsRoot,
      benchmarkId: "sakura",
      modelId: "lmstudio-community/Qwen2.5 Coder:7B Instruct",
      runId: "2026-05-06T01-02-03-004Z"
    });
    await writeRunMetadata(paths, createMetadata(paths.runDirectory));

    await expect(writeExtractedHtmlRun(paths, CLEAN_HTML)).resolves.toBe(CLEAN_HTML);

    await expect(readFile(paths.htmlPath, "utf8")).resolves.toBe(CLEAN_HTML);
  });

  it("marks extraction failure metadata without losing model identity", async () => {
    const runsRoot = await createRunsRoot();
    const paths = buildRunPaths({
      runsRoot,
      benchmarkId: "sakura",
      modelId: "lmstudio-community/Qwen2.5 Coder:7B Instruct",
      runId: "2026-05-06T01-02-03-004Z"
    });
    await writeRunMetadata(paths, createMetadata(paths.runDirectory));

    await expect(
      writeExtractedHtmlRun(paths, "<!doctype html><html><body>No head</body></html>", {
        now: new Date("2026-05-06T01:02:05.004Z")
      })
    ).rejects.toThrow(/missing required html document markers/i);

    const saved = JSON.parse(await readFile(paths.metadataPath, "utf8"));
    expect(saved).toMatchObject({
      status: "failed",
      failedAt: "2026-05-06T01:02:05.004Z",
      updatedAt: "2026-05-06T01:02:05.004Z",
      model: {
        id: "lmstudio-community/Qwen2.5 Coder:7B Instruct"
      },
      error: {
        message: expect.stringMatching(/missing required html document markers/i)
      },
      assets: {
        rawResponse: "response.raw.txt",
        html: "index.html"
      }
    });
  });
});
