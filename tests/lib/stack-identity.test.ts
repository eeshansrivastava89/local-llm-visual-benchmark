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

  it("infers historical source labels from local backend URLs when runner source fields are missing", () => {
    const identity = stackAttemptIdentity({
      model: {
        id: "local/qwen2.5-vl"
      },
      runner: {
        mode: "manual",
        baseUrl: "http://127.0.0.1:8000/v1"
      }
    });

    expect(identity.key).toBe("omlx|local/qwen2.5-vl|manual");
    expect(identity.label).toBe("local/qwen2.5-vl · oMLX · manual");
  });

  it("uses source-unrecorded instead of unknown-source when historical runs have no source metadata", () => {
    const identity = stackAttemptIdentity({
      model: {
        id: "qwen3.6-35b-a3b",
        slug: "qwen3-6-35b-a3b-d371aa3160"
      }
    });

    expect(identity.key).toBe("source-unrecorded|qwen3-6-35b-a3b-d371aa3160|manual");
    expect(identity.label).toBe("qwen3.6-35b-a3b · source unrecorded · manual");
    expect(identity.label).not.toContain("unknown-source");
  });

  it("does not treat harness-like backend labels as model sources", () => {
    const identity = stackAttemptIdentity({
      model: {
        id: "qwen3.6-35b-a3b"
      },
      runner: {
        mode: "manual",
        backendLabel: "manual"
      }
    });

    expect(identity.key).toBe("source-unrecorded|qwen3.6-35b-a3b|manual");
    expect(identity.label).toBe("qwen3.6-35b-a3b · source unrecorded · manual");
    expect(identity.label).not.toContain("manual · manual");
  });

  it("includes optional harness version labels when present", () => {
    const identity = stackAttemptIdentity({
      model: {
        id: "local/qwen2.5-vl"
      },
      runner: {
        mode: "external",
        modelSource: "omlx",
        backendLabel: "oMLX",
        harnessLabel: "OpenCode",
        harnessVersion: "0.11.0"
      }
    });

    expect(identity.harness).toBe("OpenCode 0.11.0");
    expect(identity.label).toBe("local/qwen2.5-vl · oMLX · OpenCode 0.11.0");
  });
});
