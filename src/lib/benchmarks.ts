import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";

export interface BenchmarkDefinition {
  id: string;
  title: string;
  description: string;
  prompt: string;
  sourcePath: string;
}

interface BenchmarkFrontmatter {
  id?: unknown;
  title?: unknown;
  description?: unknown;
}

const HTML_OUTPUT_CONTRACT = [
  "Output contract:",
  "- Return exactly one complete self-contained HTML document.",
  "- The document must include <!doctype html>, <html>, <head>, and <body>.",
  "- Do not depend on external network assets or CDN libraries.",
  "- Inline small helper functions if useful, but keep the final artifact portable as one file.",
  "- Use no explanations, Markdown fences, commentary, or extra text before or after the HTML."
].join("\n");

export function appendHtmlOutputContract(prompt: string): string {
  return `${prompt.trim()}\n\n${HTML_OUTPUT_CONTRACT}`;
}

export async function loadBenchmarks(
  benchmarkDirectory: string
): Promise<BenchmarkDefinition[]> {
  const entries = await readdir(benchmarkDirectory, { withFileTypes: true });
  const markdownFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const benchmarks: BenchmarkDefinition[] = [];
  const seenIds = new Map<string, string>();

  for (const filename of markdownFiles) {
    const sourcePath = join(benchmarkDirectory, filename);
    const raw = await readFile(sourcePath, "utf8");
    const parsed = matter(raw);
    const frontmatter = parsed.data as BenchmarkFrontmatter;

    const id = readRequiredString(frontmatter, "id", filename);
    const title = readRequiredString(frontmatter, "title", filename);
    const description = readRequiredString(frontmatter, "description", filename);

    const duplicateSource = seenIds.get(id);
    if (duplicateSource) {
      throw new Error(
        `Duplicate benchmark id "${id}" in ${duplicateSource} and ${filename}.`
      );
    }

    seenIds.set(id, filename);
    benchmarks.push({
      id,
      title,
      description,
      prompt: parsed.content.trim(),
      sourcePath
    });
  }

  return benchmarks;
}

function readRequiredString(
  frontmatter: BenchmarkFrontmatter,
  field: keyof BenchmarkFrontmatter,
  filename: string
): string {
  const value = frontmatter[field];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `Benchmark ${filename} is missing required frontmatter field "${field}".`
    );
  }

  return value.trim();
}
