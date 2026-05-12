import { describe, expect, it } from "vitest";
import { buildPromptStackMatrix, matrixCellLabel } from "../../public/js/matrix.js";

const baseRun = {
  runId: "run-1",
  benchmark: {
    id: "sakura",
    title: "Sakura Particle Field"
  },
  model: {
    id: "local/qwen2.5-vl",
    slug: "local-qwen2-5-vl"
  },
  runner: {
    modelSource: "omlx",
    intendedRunner: "opencode",
    backendLabel: "oMLX"
  },
  assets: {
    metadata: "metadata.json",
    preview: "preview.png",
    video: "preview.webm"
  },
  updatedAt: "2026-05-06T19:13:00.000Z"
};

describe("prompt stack matrix", () => {
  it("groups runs by prompt and stack identity", () => {
    const matrix = buildPromptStackMatrix([
      baseRun,
      {
        ...baseRun,
        runId: "run-2",
        runner: {
          modelSource: "lmstudio",
          intendedRunner: "manual",
          backendLabel: "LM Studio"
        },
        assets: {
          metadata: "metadata.json",
          preview: "preview.png"
        }
      },
      {
        ...baseRun,
        runId: "run-3",
        benchmark: {
          id: "solar-system",
          title: "Solar System Orrery"
        }
      }
    ]);

    expect(matrix.columns.map((column) => column.label)).toEqual([
      "local/qwen2.5-vl · oMLX · opencode",
      "local/qwen2.5-vl · LM Studio · manual"
    ]);
    expect(matrix.rows.map((row) => row.title)).toEqual([
      "Sakura Particle Field",
      "Solar System Orrery"
    ]);
    expect(matrixCellLabel(matrix.rows[0].cells.get(matrix.columns[0].key))).toBe("1 video");
    expect(matrixCellLabel(matrix.rows[0].cells.get(matrix.columns[1].key))).toBe("1 preview");
    expect(matrixCellLabel(matrix.rows[1].cells.get(matrix.columns[1].key))).toBe("—");
  });
});
