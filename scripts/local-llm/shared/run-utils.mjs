import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";

/**
 * Slugify a model ID into a filesystem-safe directory name.
 * Must produce the same result as src/lib/paths.ts slugModelId().
 */
export function slugModelId(modelId, maxLength = 80) {
  const hash = createHash("sha256").update(modelId).digest("hex").slice(0, 10);
  const normalized = modelId.normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").toLowerCase();
  const slug = normalized.replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").replace(/-{2,}/gu, "-");
  if (slug.length > 0 && slug.length <= maxLength && slug === normalized) return slug;
  const baseMaxLength = Math.max(1, maxLength - 11);
  const base = slug.slice(0, baseMaxLength).replace(/^-+|-+$/gu, "") || "model";
  return `${base}-${hash}`;
}

/**
 * Create a run ID from a date, matching web's createRunId format.
 */
export function createRunId(date = new Date()) {
  return date.toISOString().replace(/:/gu, "-").replace(/\./gu, "-");
}

/**
 * Build the tool prompt for a benchmark.
 * Visual prompts get the HTML wrapper instructions; data-science prompts are used as-is.
 * Must match src/lib/prompt-prep.ts buildToolPrompt().
 */
export function buildToolPrompt(benchmark, kind) {
  if (kind === "data-science") return benchmark.prompt;
  return [
    "Create a complete, self-contained HTML file for the request below.",
    "Write the file as `index.html` in the current working directory.",
    "Do not create any folders, do not infer a filesystem path, and do not print the HTML in chat.",
    "",
    "The HTML must include all CSS and JavaScript inline and must not depend on external network assets.",
    "After building the page, run a visual QA pass with agent-browser or Playwright: open the saved index.html, inspect the rendered result, and fix any obvious layout, animation, console, or viewport issues before you finish.",
    "",
    benchmark.prompt
  ].join("\n");
}

/**
 * Load benchmark definitions from markdown files in a directory.
 * Must match src/lib/benchmarks.ts loadBenchmarks().
 */
export async function loadBenchmarks(benchDir) {
  const entries = await readdir(benchDir);
  const markdownFiles = entries.filter((f) => f.endsWith(".md")).sort();
  const benchmarks = [];
  for (const filename of markdownFiles) {
    const raw = await readFile(join(benchDir, filename), "utf8");
    const parsed = matter(raw);
    const id = parsed.data?.id ?? filename.replace(/\.md$/u, "");
    const title = String(parsed.data?.title ?? id);
    const description = String(parsed.data?.description ?? "");
    benchmarks.push({
      id,
      title,
      description,
      prompt: parsed.content.trim(),
      kind: id === "ab-test-analysis" ? "data-science" : "visual"
    });
  }
  return benchmarks;
}

/**
 * Scan run directories for cloud model IDs (modelSource === "cloud").
 * Returns deduplicated list of { id, label } sorted by frequency (most-used first).
 */
export async function loadCloudModels(runsDir) {
  const cloudModels = new Map();
  try {
    const benchDirs = await readdir(runsDir);
    for (const benchDir of benchDirs) {
      const benchPath = join(runsDir, benchDir);
      let modelDirs;
      try { modelDirs = await readdir(benchPath); } catch { continue; }
      for (const modelDir of modelDirs) {
        const modelPath = join(benchPath, modelDir);
        let runDirs;
        try { runDirs = await readdir(modelPath); } catch { continue; }
        for (const runId of runDirs) {
          try {
            const raw = await readFile(join(modelPath, runId, "metadata.json"), "utf8");
            const meta = JSON.parse(raw);
            if (meta.runner?.modelSource === "cloud") {
              const modelId = meta.model?.id;
              if (modelId) {
                cloudModels.set(modelId, (cloudModels.get(modelId) ?? 0) + 1);
              }
            }
          } catch { /* skip */ }
        }
      }
    }
  } catch { /* runs dir may not exist */ }
  return [...cloudModels.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => ({ id, label: id }));
}