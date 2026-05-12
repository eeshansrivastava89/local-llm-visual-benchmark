import { describe, expect, it } from "vitest";
import { stackAttemptIdentity } from "../../public/js/runs.js";

const baseRun = {
  runId: "2026-05-06T01-02-03-004Z",
  benchmark: {
    id: "sakura",
    title: "Sakura Tree"
  },
  model: {
    id: "Qwen3.6-35B-A3B-4bit",
    slug: "qwen3-6-35b-a3b-d371aa3160"
  },
  runner: {
    modelSource: "omlx",
    intendedRunner: "opencode",
    backendLabel: "oMLX"
  }
};

describe("stackAttemptIdentity", () => {
  it("distinguishes the same model artifact across model source and harness", () => {
    const omlxOpenCode = stackAttemptIdentity(baseRun);
    const lmStudioOpenCode = stackAttemptIdentity({
      ...baseRun,
      runner: {
        ...baseRun.runner,
        modelSource: "lmstudio",
        backendLabel: "LM Studio"
      }
    });
    const omlxManual = stackAttemptIdentity({
      ...baseRun,
      runner: {
        ...baseRun.runner,
        intendedRunner: "manual"
      }
    });

    expect(omlxOpenCode.key).not.toBe(lmStudioOpenCode.key);
    expect(omlxOpenCode.key).not.toBe(omlxManual.key);
    expect(omlxOpenCode).toMatchObject({
      modelSource: "omlx",
      modelArtifact: "qwen3-6-35b-a3b-d371aa3160",
      harness: "opencode"
    });
  });

  it("uses stable fallback fields for historical/manual runs", () => {
    const identity = stackAttemptIdentity({
      model: {
        id: "local/qwen2.5-vl"
      },
      runner: {
        mode: "manual",
        backendLabel: "LM Studio"
      }
    });

    expect(identity.key).toBe("lm-studio|local/qwen2.5-vl|manual");
    expect(identity.label).toBe("local/qwen2.5-vl · LM Studio · manual");
  });
});
