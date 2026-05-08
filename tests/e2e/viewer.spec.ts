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
  await mockApi(page, { lmStudioOnline: true });

  await page.goto("/");
  await page.waitForSelector("[data-run-id]", { timeout: 5000 });

  await expect(
    page.getByRole("heading", { name: "Local LLM Visual Benchmark" })
  ).toBeVisible();
  await expect(page.getByText("Browse and collect visual benchmark outputs.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Prepare run" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Setup" })).toBeVisible();
  await expect(page.getByRole("button", { name: "LM Studio" })).toHaveCount(0);
  await expect(page.getByLabel("Filter by model")).toBeVisible();
  await expect(page.getByLabel("Filter by prompt")).toBeVisible();
  await expect(page.getByRole("button", { name: "Gallery" })).toBeVisible();
  await expect(page.getByRole("button", { name: "By model" })).toBeVisible();
  await expect(page.getByRole("button", { name: "By prompt" })).toBeVisible();
  await expect(page.getByText("1 with HTML, 0 prepared, 0 failed")).toBeVisible();
  await expect(page.locator("[data-run-id]").first()).toBeVisible();

  await page.getByRole("button", { name: "Setup" }).click();
  await expect(page.getByRole("dialog", { name: "Setup" })).toBeVisible();
  await expect(page.getByText("Prepare a run slot")).toBeVisible();
  await expect(page.getByText("Run in your tool")).toBeVisible();
  await expect(page.getByText("Refresh the gallery")).toBeVisible();
  await expect(page.getByRole("heading", { name: "LM Studio" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Model inventory" })).toBeVisible();
  await expect(page.getByText("OpenCode Setup")).toHaveCount(0);
  await expect(page.getByText("Pi Setup")).toHaveCount(0);
  await expect(page.locator("[data-step]")).toHaveCount(0);
  await expect(page.getByText("✓ Pi").first()).toBeVisible();
  await expect(page.getByText("live").first()).toBeVisible();
  await expect(page.locator("#availableModelChoices")).toHaveCSS("grid-template-columns", /px/);

  const baseUrlBox = await page.locator("#baseUrl").boundingBox();
  const testButtonBox = await page.locator("#refreshConnection").boundingBox();
  expect(Math.abs((baseUrlBox?.height ?? 0) - (testButtonBox?.height ?? 0))).toBeLessThan(1);

  await page.getByRole("button", { name: "Test" }).click();
  await expect(page.locator("#connectionMessage")).toContainText("2 models discovered");
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
  await expect(page.locator("#prepModel")).toHaveCount(0);
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

  const layoutColumns = await page.locator("#prepLayout").evaluate((el) =>
    getComputedStyle(el).gridTemplateColumns
  );
  expect(layoutColumns.split(" ").length).toBeGreaterThanOrEqual(2);

  const promptBox = await page.locator("#preparedPrompt").boundingBox();
  expect(promptBox?.height ?? 0).toBeGreaterThan(300);

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
  await expect(page.getByRole("link", { name: "Prompt file" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Raw response" })).toBeHidden();
  await expect(page.locator("#detailMeta")).not.toContainText("Tool");
  await expect(page.locator("#detailMeta")).not.toContainText("Error");
});

test("grouped views scroll as one surface and avoid duplicate card labels", async ({ page }) => {
  const manyRuns = Array.from({ length: 18 }, (_, index) => ({
    ...sampleRun,
    runId: `2026-05-06T20-${String(index).padStart(2, "0")}-00-000Z`,
    benchmark: index % 2 === 0 ? benchmarks[0] : benchmarks[1],
    model: index % 3 === 0
      ? { id: models[0].id, slug: "google-gemma-4-e4b" }
      : { id: models[1].id, slug: "local-qwen2-5-vl" },
    runDirectory: `/tmp/runs/${index}`
  }));
  await mockApi(page, { lmStudioOnline: true, runs: manyRuns });

  await page.goto("/");
  await page.waitForSelector("[data-run-id]", { timeout: 5000 });

  await page.getByRole("button", { name: "By prompt" }).click();
  await expect(page.locator("#runsSurface")).toHaveCSS("overflow-y", "auto");
  await expect(page.locator("#runsSurface")).toHaveCSS("scrollbar-width", "none");
  await expect(page.locator(".grouped-runs")).toBeVisible();
  const promptGroup = page.locator(".group").filter({ hasText: benchmarks[0].title }).first();
  const promptCard = promptGroup.locator("[data-run-id]").first();
  await expect(promptCard).not.toContainText(benchmarks[0].title);
  await expect(promptCard).toContainText(/google\/gemma-4-e4b|local\/qwen2\.5-vl/);

  await page.getByRole("button", { name: "By model" }).click();
  const modelGroup = page.locator(".group").filter({ hasText: models[0].id }).first();
  const modelCard = modelGroup.locator("[data-run-id]").first();
  await expect(modelCard).not.toContainText(models[0].id);
  await expect(modelCard).toContainText(/Sakura Particle Field|Solar System Orrery/);
});

test("refresh reloads prompt files and saved runs", async ({ page }) => {
  let benchmarkResponse = benchmarks;
  let runsResponse: unknown[] = [sampleRun];
  await mockApi(page, {
    lmStudioOnline: true,
    benchmarks: () => benchmarkResponse,
    runs: () => runsResponse
  });

  await page.goto("/");
  await page.waitForSelector("[data-run-id]", { timeout: 5000 });
  await expect(page.getByLabel("Filter by prompt")).not.toContainText("New Prompt");

  benchmarkResponse = [
    ...benchmarks,
    {
      id: "new-prompt",
      title: "New Prompt",
      description: "Added while app is open",
      prompt: "Draw a new scene."
    }
  ];
  runsResponse = [];

  await page.getByRole("button", { name: "Refresh" }).click();

  await expect(page.getByLabel("Filter by prompt")).toContainText("New Prompt");
  await expect(page.locator("[data-run-id]")).toHaveCount(0);
});

test("deletes a run folder from the detail modal after confirmation", async ({ page }) => {
  let deletePayload: unknown;
  await mockApi(page, {
    lmStudioOnline: true,
    onDelete: (payload) => {
      deletePayload = payload;
    }
  });

  let nativeDialogOpened = false;
  page.on("dialog", async (dialog) => {
    nativeDialogOpened = true;
    await dialog.dismiss();
  });

  await page.goto("/");
  await page.waitForSelector("[data-run-id]", { timeout: 5000 });
  await page.locator("[data-run-id]").first().click();
  await page.getByRole("button", { name: "Delete run" }).click();

  await expect(page.getByRole("dialog", { name: "Delete run" })).toBeVisible();
  await expect(page.locator("#deleteRunPath")).toContainText(sampleRun.runDirectory);
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  await page.getByRole("button", { name: "Delete folder" }).click();

  await expect.poll(() => deletePayload).toMatchObject({
    runDirectory: sampleRun.runDirectory
  });
  expect(nativeDialogOpened).toBe(false);
});

test("keeps the viewer usable on mobile widths", async ({ page }) => {
  await mockApi(page, { lmStudioOnline: false, runs: [] });
  await page.setViewportSize({ width: 390, height: 900 });

  await page.goto("/");
  await page.waitForSelector("[data-run-id]", { timeout: 5000, state: "detached" });

  await expect(page.getByRole("button", { name: "Prepare run" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Setup" })).toBeVisible();

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
    benchmarks?: () => typeof benchmarks;
    runs?: unknown[] | (() => unknown[]);
    onPrepare?: (payload: unknown) => void;
    onDelete?: (payload: unknown) => void;
  }
): Promise<void> {
  await page.route("**/api/benchmarks", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ benchmarks: options.benchmarks?.() ?? benchmarks })
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
    if (route.request().method() === "DELETE") {
      const payload = route.request().postDataJSON();
      options.onDelete?.(payload);
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ deleted: true, runDirectory: payload.runDirectory })
      });
      return;
    }

    const runs = typeof options.runs === "function" ? options.runs() : options.runs;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ runs: runs ?? [sampleRun] })
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

  await page.route("**/api/model-sync", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        sync: {
          enabled: true,
          paths: {
            opencode: "/home/.config/opencode/opencode.json",
            pi: "/home/.pi/agent/models.json"
          },
          files: {
            opencode: {
              exists: true,
              modelIds: [models[1].id]
            },
            pi: {
              exists: true,
              modelIds: [models[1].id]
            }
          }
        }
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
