import { expect, test, type Page } from "@playwright/test";

const benchmarks = [
  {
    id: "sakura",
    title: "Sakura Particle Field",
    description: "Animated sakura scene",
    prompt: "Create a sakura animation with layered petals."
  },
  {
    id: "solar-system",
    title: "Solar System Orrery",
    description: "Interactive orbital scene",
    prompt: "Create a solar system visualization."
  }
];

const models = [
  { id: "google/gemma-4-e4b" },
  { id: "local/qwen2.5-vl" }
];

const sampleRun = {
  runId: "2026-05-06T19-12-00-000Z",
  benchmark: benchmarks[0],
  model: {
    id: models[1].id,
    slug: "local-qwen2-5-vl"
  },
  status: "completed",
  createdAt: "2026-05-06T19:12:00.000Z",
  updatedAt: "2026-05-06T19:13:00.000Z",
  runDirectory: "/tmp/runs/sakura/local-qwen2-5-vl/2026-05-06T19-12-00-000Z",
  assets: {
    metadata: "metadata.json",
    prompt: "prompt.md",
    rawResponse: "response.raw.txt",
    html: "index.html",
    preview: "preview.png"
  }
};

test("renders viewer with passive LM Studio discovery", async ({ page }) => {
  await mockApi(page, { lmStudioOnline: false });

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Local LLM Visual Benchmark" })
  ).toBeVisible();
  await expect(page.getByLabel("LM Studio base URL")).toHaveValue(
    "http://localhost:1234/v1"
  );
  await expect(page.getByText("Offline", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Prompts", { exact: true }).getByText("Sakura Particle Field")).toBeVisible();
  await expect(page.getByText("1 with HTML, 0 prepared, 0 failed")).toBeVisible();
  await expect(page.getByRole("button", { name: /Sakura Particle Field/ })).toBeVisible();
});

test("prepares a run slot and shows the generated prompt", async ({ page }) => {
  let preparePayload: unknown;
  await mockApi(page, {
    lmStudioOnline: true,
    onPrepare: (payload) => {
      preparePayload = payload;
    }
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Prepare run" }).click();
  await page.getByLabel("Prompt", { exact: true }).selectOption("solar-system");
  await page.getByLabel("Discovered model").selectOption("google/gemma-4-e4b");
  await page.getByLabel("Tool prompt").selectOption("opencode");
  await page.getByRole("button", { name: "Prepare run slot" }).click();

  await expect.poll(() => preparePayload).toMatchObject({
    benchmarkId: "solar-system",
    modelId: "google/gemma-4-e4b",
    tool: "opencode"
  });
  await expect(page.getByLabel("Tool prompt")).toHaveValue("opencode");
  await expect(page.getByPlaceholder("Prepare a run slot")).toHaveValue(
    /Save one complete self-contained HTML document/
  );
  await expect(page.getByText("Run slot prepared")).toBeVisible();
  await expect(page.getByRole("button", { name: /Solar System Orrery/ })).toBeVisible();
});

test("supports prompt comparison and run details", async ({ page }) => {
  await mockApi(page, {
    lmStudioOnline: true,
    runs: [
      sampleRun,
      {
        ...sampleRun,
        runId: "2026-05-06T20-12-00-000Z",
        model: {
          id: models[0].id,
          slug: "google-gemma-4-e4b"
        },
        runDirectory: "/tmp/runs/sakura/google-gemma-4-e4b/2026-05-06T20-12-00-000Z"
      }
    ]
  });

  await page.goto("/");
  await page.getByRole("button", { name: "By prompt" }).click();

  await expect(page.getByRole("heading", { name: "Sakura Particle Field" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Sakura Particle Field google\/gemma-4-e4b/ })).toBeVisible();

  await page.getByRole("button", { name: /Sakura Particle Field local\/qwen2.5-vl/ }).click();
  await expect(page.getByRole("dialog", { name: "Run detail" })).toBeVisible();
  await expect(page.getByText("Create a sakura animation")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open HTML" })).toHaveAttribute(
    "href",
    /index\.html$/
  );
  await expect(page.getByRole("link", { name: "Prompt file" })).toHaveAttribute(
    "href",
    /prompt\.md$/
  );
});

test("keeps the viewer usable on mobile widths", async ({ page }) => {
  await mockApi(page, { lmStudioOnline: false, runs: [] });
  await page.setViewportSize({ width: 390, height: 900 });

  await page.goto("/");

  await expect(page.getByRole("button", { name: "Prepare run" })).toBeVisible();
  await expect(page.getByText("No runs match the current filters")).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflow).toBe(false);
});

test("falls back to exported static data without prepare controls", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          message: "API unavailable in static publish"
        }
      })
    });
  });
  await page.route("**/export/manifest.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        version: 1,
        generatedAt: "2026-05-06T20:00:00.000Z",
        benchmarks,
        runs: [
          {
            ...sampleRun,
            runDirectory:
              "export/runs/sakura/local-qwen2-5-vl/2026-05-06T19-12-00-000Z"
          }
        ]
      })
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Prepare run" }).click();

  await expect(page.getByLabel("LM Studio", { exact: true }).getByText("Static", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Prepare run slot" })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Sakura Particle Field/ })).toBeVisible();
});

async function mockApi(
  page: Page,
  options: {
    lmStudioOnline: boolean;
    runs?: unknown[];
    onPrepare?: (payload: unknown) => void;
  }
): Promise<void> {
  await page.route("**/api/benchmarks", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ benchmarks })
    });
  });

  await page.route("**/api/system-stats", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        stats: {
          collectedAt: "2026-05-06T19:12:00.000Z",
          cpu: {
            cores: 12,
            usagePercent: 18.5
          },
          memory: {
            totalBytes: 34359738368,
            usedBytes: 25769803776
          },
          gpu: {
            devices: [{ name: "Apple M", cores: "20" }]
          }
        }
      })
    });
  });

  await page.route("**/api/runs", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ runs: options.runs ?? [sampleRun] })
    });
  });

  await page.route("**/api/status**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        app: { status: "ok" },
        lmStudio: {
          baseUrl: "http://localhost:1234/v1",
          connection: options.lmStudioOnline
            ? { ok: true, baseUrl: "http://localhost:1234/v1" }
            : {
                ok: false,
                baseUrl: "http://localhost:1234/v1",
                error: "LM Studio checking connection network error: failed to fetch"
              }
        }
      })
    });
  });

  await page.route("**/api/lmstudio/models**", async (route) => {
    if (!options.lmStudioOnline) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            message: "LM Studio listing models network error: failed to fetch"
          }
        })
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        baseUrl: "http://localhost:1234/v1",
        models
      })
    });
  });

  await page.route("**/api/prepare-run", async (route) => {
    const payload = route.request().postDataJSON();
    options.onPrepare?.(payload);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        preparedRun: {
          run: {
            runId: "2026-05-07T04-00-32-122Z",
            benchmark: benchmarks.find((benchmark) => benchmark.id === payload.benchmarkId),
            model: {
              id: payload.modelId,
              slug: "google-gemma-4-e4b"
            },
            status: "prepared",
            tool: payload.tool,
            createdAt: "2026-05-07T04:00:32.122Z",
            updatedAt: "2026-05-07T04:00:32.122Z",
            runDirectory:
              "/tmp/runs/solar-system/google-gemma-4-e4b/2026-05-07T04-00-32-122Z",
            assets: {
              metadata: "metadata.json",
              prompt: "prompt.md"
            }
          },
          prompt:
            "OpenCode\nSave one complete self-contained HTML document to: /tmp/runs/solar-system/google-gemma-4-e4b/2026-05-07T04-00-32-122Z/index.html",
          paths: {
            runDirectory:
              "/tmp/runs/solar-system/google-gemma-4-e4b/2026-05-07T04-00-32-122Z",
            promptPath:
              "/tmp/runs/solar-system/google-gemma-4-e4b/2026-05-07T04-00-32-122Z/prompt.md",
            htmlPath:
              "/tmp/runs/solar-system/google-gemma-4-e4b/2026-05-07T04-00-32-122Z/index.html",
            metadataPath:
              "/tmp/runs/solar-system/google-gemma-4-e4b/2026-05-07T04-00-32-122Z/metadata.json",
            previewPath:
              "/tmp/runs/solar-system/google-gemma-4-e4b/2026-05-07T04-00-32-122Z/preview.png"
          }
        }
      })
    });
  });
}
