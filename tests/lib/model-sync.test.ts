import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getModelSyncState,
  mirrorModelsToConfigs
} from "../../src/lib/model-sync";

async function withTempHome(
  run: (home: string) => Promise<void>
): Promise<void> {
  const previousHome = process.env.HOME;
  const home = await mkdtemp(join(tmpdir(), "llm-sync-home-"));
  vi.stubEnv("HOME", home);
  try {
    await run(home);
  } finally {
    if (previousHome === undefined) {
      vi.unstubAllEnvs();
    } else {
      vi.stubEnv("HOME", previousHome);
    }
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("model sync", () => {
  it("reads existing model IDs from opencode and pi configs", async () => {
    await withTempHome(async (home) => {
      const opencodePath = join(home, ".config", "opencode", "opencode.json");
      const piPath = join(home, ".pi", "agent", "models.json");
      await mkdir(join(home, ".config", "opencode"), { recursive: true });
      await mkdir(join(home, ".pi", "agent"), { recursive: true });
      await writeFile(
        opencodePath,
        JSON.stringify({
          provider: {
            lmstudio: {
              models: {
                "model-z": { name: "model-z" },
                "model-a": { name: "model-a" }
              }
            }
          }
        })
      );
      await writeFile(
        piPath,
        JSON.stringify({
          providers: {
            lmstudio: {
              models: [{ id: "model-pi-2" }, { id: "model-pi-1" }]
            }
          }
        })
      );

      const state = await getModelSyncState({ enabled: true });
      expect(state.enabled).toBe(true);
      expect(state.files.opencode.modelIds).toEqual(["model-a", "model-z"]);
      expect(state.files.pi.modelIds).toEqual(["model-pi-1", "model-pi-2"]);
    });
  });

  it("mirrors discovered models into both configs and preserves custom fields", async () => {
    await withTempHome(async (home) => {
      const opencodePath = join(home, ".config", "opencode", "opencode.json");
      const piPath = join(home, ".pi", "agent", "models.json");
      await mkdir(join(home, ".config", "opencode"), { recursive: true });
      await mkdir(join(home, ".pi", "agent"), { recursive: true });

      await writeFile(
        opencodePath,
        JSON.stringify({
          provider: {
            lmstudio: {
              options: {
                apiKey: "custom-key"
              },
              models: {
                stale: {
                  name: "stale"
                },
                "model-a": {
                  name: "A Label",
                  extra: true
                }
              }
            }
          }
        })
      );

      await writeFile(
        piPath,
        JSON.stringify({
          providers: {
            lmstudio: {
              models: [
                { id: "stale", name: "stale" },
                { id: "model-b", name: "B Label", extraField: "keep" }
              ]
            }
          }
        })
      );

      const result = await mirrorModelsToConfigs(
        {
          baseUrl: "http://localhost:1234",
          modelIds: ["model-b", "model-a"],
          targets: ["opencode", "pi"]
        },
        {
          enabled: true
        }
      );

      expect(result.updated).toEqual(["opencode", "pi"]);
      expect(result.mirroredModelCount).toBe(2);
      expect(result.state.files.opencode.modelIds).toEqual(["model-a", "model-b"]);
      expect(result.state.files.pi.modelIds).toEqual(["model-a", "model-b"]);

      const opencode = JSON.parse(await readFile(opencodePath, "utf8"));
      const pi = JSON.parse(await readFile(piPath, "utf8"));
      expect(opencode.provider.lmstudio.options.baseURL).toBe("http://localhost:1234/v1");
      expect(opencode.provider.lmstudio.options.apiKey).toBe("custom-key");
      expect(opencode.provider.lmstudio.models).toEqual({
        "model-a": {
          name: "A Label",
          extra: true
        },
        "model-b": {
          name: "model-b"
        }
      });
      expect(pi.providers.lmstudio.baseUrl).toBe("http://localhost:1234/v1");
      expect(pi.providers.lmstudio.models).toEqual([
        {
          id: "model-a",
          name: "model-a",
          reasoning: true,
          input: ["text", "image"],
          contextWindow: 262144,
          maxTokens: 32768
        },
        {
          id: "model-b",
          name: "B Label",
          extraField: "keep"
        }
      ]);
    });
  });

  it("rejects mirror calls when dev mode is disabled", async () => {
    await expect(
      mirrorModelsToConfigs(
        {
          modelIds: ["model-a"],
          targets: ["pi"]
        },
        {
          enabled: false
        }
      )
    ).rejects.toThrow(/only available in dev server mode/i);
  });
});
