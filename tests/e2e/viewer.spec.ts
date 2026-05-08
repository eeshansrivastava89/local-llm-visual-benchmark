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
    html: "index.html",
    preview: "preview.png"
  }
};

test("renders viewer with compact header and dropdown filters", async ({ page }) => {
  await mockApi(page, { lmStudioOnline: false });

  await page.goto("/");
  await page.waitForSelector("[data-run-id]", { timeout: 5000 });

  await expect(
    page.getByRole("heading", { name: "Local LLM Visual Benchmark" })
  ).toBeVisible();
  await expect(page.getByText("Browse and collect visual benchmark outputs.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Prepare run" })).toBeVisible();
  await expect(page.locator("#setupToggle")).toBeVisible();
  await expect(page.getByRole("button", { name: "LM Studio" })).toBeVisible();
  await expect(page.getByLabel("Filter by model")).toBeVisible();
  await expect(page.getByLabel("Filter by prompt")).toBeVisible();
  await expect(page.getByRole("button", { name: "Gallery" })).toBeVisible();
  await expect(page.getByRole("button", { name: "By model" })).toBeVisible();
  await expect(page.getByRole("button", { name: "By prompt" })).toBeVisible();
  await expect(page.getByText("1 with HTML, 0 prepared, 0 failed")).toBeVisible();
  await expect(page.locator("[data-run-id]").first()).toBeVisible();

  await page.getByRole("button", { name: "LM Studio" }).click();
  await expect(page.getByText("Current LM Studio models")).toBeVisible();
  await expect(page.getByText("Run models from filesystem")).toBeVisible();
});

test("prepares a run slot via modal and shows the generated prompt", async ({ page }) => {
  let preparePayload: unknown;
  await mockApi(page, {
    lmStudioOnline: true,
    onPrepare: (payload) => {
      preparePayload = payload;
    }
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Prepare run" }).click();

  await expect(page.locator("#prepBackdrop[open]")).toBeVisible();
  await page.locator("#prepBackdrop").locator("#prepBenchmark").selectOption("solar-system");
  await page.locator("#prepBackdrop").locator("#prepModelSelect").selectOption("google/gemma-4-e4b");
  await page.locator("#prepBackdrop").getByRole("button", { name: "Prepare slot" }).click();

  await expect.poll(() => preparePayload).toMatchObject({
    benchmarkId: "solar-system",
    modelId: "google/gemma-4-e4b"
  });
  await expect(page.locator("#prepBackdrop").locator("#preparedPrompt")).toHaveValue(
    /Save one complete self-contained HTML document/
  );
  await expect(page.getByText("Run slot prepared")).toBeVisible();

  await page.locator("#closePrep").click();
  await expect(page.locator("[data-run-id]").first()).toBeVisible();
});

test("supports prompt comparison and run details via modal", async ({ page }) => {
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
  await page.waitForSelector("[data-run-id]", { timeout: 5000 });
  await page.getByRole("button", { name: "By prompt" }).click();

  await expect(page.locator("[data-run-id]")).toHaveCount(2);

  await page.locator("[data-run-id]").first().click();
  await expect(page.locator("#detailBackdrop[open]")).toBeVisible();
  await expect(page.locator("#detailPreview iframe")).toHaveAttribute(
    "src",
    /asset=index\.html$/
  );
  await expect(page.getByText("Create a sakura animation")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open HTML" })).toHaveAttribute(
    "href",
    /index\.html$/
  );
  await expect(page.getByRole("link", { name: "Prompt file" })).toHaveAttribute(
    "href",
    /prompt\.md$/
  );
  await expect(page.getByRole("link", { name: "Raw response" })).toBeHidden();
  await expect(page.locator("#detailMeta")).not.toContainText("Tool");
  await expect(page.locator("#detailMeta")).not.toContainText("Error");
});

test("keeps the viewer usable on mobile widths", async ({ page }) => {
  await mockApi(page, { lmStudioOnline: false, runs: [] });
  await page.setViewportSize({ width: 390, height: 900 });

  await page.goto("/");
  await page.waitForSelector("[data-run-id]", { timeout: 5000, state: "detached" });

  await expect(page.getByRole("button", { name: "Prepare run" })).toBeVisible();
  await expect(page.getByRole("button", { name: "How it works" })).toBeVisible();

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

  await expect(page.getByRole("dialog", { name: "Prepare run" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Prepare slot" })).toBeDisabled();
  await page.getByRole("button", { name: "Close" }).first().click();
  await expect(page.locator("[data-run-id]").first()).toBeVisible();
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
            "Save one complete self-contained HTML document to: /tmp/runs/solar-system/google-gemma-4-e4b/2026-05-07T04-00-32-122Z/index.html",
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
