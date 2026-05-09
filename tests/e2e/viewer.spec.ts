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

const sampleRunWithVideo = {
  ...sampleRun,
  assets: {
    ...sampleRun.assets,
    video: "preview.webm"
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
  await expect(page.getByRole("button", { name: "Capture media" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Setup" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use dark theme" })).toBeVisible();
  await expect(page.getByRole("button", { name: "LM Studio" })).toHaveCount(0);
  const attribution = page.getByRole("link", { name: "a side quest by eeshans.com" });
  await expect(attribution).toHaveAttribute("href", "https://eeshans.com/");
  await expect(attribution).toHaveCSS("border-radius", "999px");
  await expect(page.getByLabel("Filter by model")).toBeVisible();
  await expect(page.getByLabel("Filter by prompt")).toBeVisible();
  await expect(page.locator("[data-mode]")).toHaveText(["By model", "By prompt", "Gallery"]);
  await expect(page.getByRole("button", { name: "By model" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "By prompt" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Gallery" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("heading", { name: "Model attempts" })).toBeVisible();
  await expect(page.getByText("0 with video, 1 need capture, 0 prepared, 0 failed")).toBeVisible();
  await expect(page.locator("[data-run-id]").first()).toBeVisible();
  await expect(page.getByRole("contentinfo")).toContainText("© 2025–2026 Eeshan Srivastava");
  await expect(page.getByRole("contentinfo")).toContainText("Personal project · MIT License · Non-commercial");
  await expect(page.getByRole("link", { name: "Source" })).toHaveAttribute(
    "href",
    "https://github.com/eeshansrivastava89/local-llm-visual-benchmark"
  );
  await expect(page.getByRole("link", { name: "LinkedIn" })).toHaveAttribute(
    "href",
    "https://www.linkedin.com/in/eeshans/"
  );

  await page.getByRole("button", { name: "Setup" }).click();
  const setupDialog = page.getByRole("dialog", { name: "Setup" });
  await expect(setupDialog).toBeVisible();
  await expect(setupDialog.getByRole("heading", { name: "Prepare slot" })).toHaveCount(0);
  await expect(setupDialog.getByRole("heading", { name: "Run externally" })).toHaveCount(0);
  await expect(setupDialog.getByRole("heading", { name: "Capture media" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "LM Studio" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Model inventory" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sync Pi" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sync OpenCode" })).toBeVisible();
  await expect(page.locator("#lmConfigPi .sync-target-logo")).toBeVisible();
  await expect(page.locator("#lmConfigOpenCode .sync-target-logo")).toBeVisible();
  await expect(page.getByText("OpenCode Setup")).toHaveCount(0);
  await expect(page.getByText("Pi Setup")).toHaveCount(0);
  await expect(page.locator("[data-step]")).toHaveCount(0);
  await expect(page.getByText("Pi synced").first()).toBeVisible();
  await expect(page.getByText("OpenCode synced").first()).toBeVisible();
  await expect(page.getByText("/home/.pi/agent/models.json")).toBeVisible();
  await expect(page.locator("#availableModelChoices").getByText("live").first()).toBeVisible();
  const setupColumns = await page.locator(".setup-console-layout").evaluate((el) =>
    getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length
  );
  expect(setupColumns).toBe(1);
  const operationColumns = await page.locator(".lm-operations-grid").evaluate((el) =>
    getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length
  );
  expect(operationColumns).toBe(3);
  const modelRowColumns = await page.locator(".lm-model-row").first().evaluate((el) =>
    getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length
  );
  expect(modelRowColumns).toBe(3);

  const baseUrlBox = await page.locator("#baseUrl").boundingBox();
  const testButtonBox = await page.locator("#refreshConnection").boundingBox();
  expect(Math.abs((baseUrlBox?.height ?? 0) - (testButtonBox?.height ?? 0))).toBeLessThan(1);

  await page.getByRole("button", { name: "Test" }).click();
  await expect(page.locator("#connectionMessage")).toContainText("2 models discovered");
});

test("toggles and persists the dark theme", async ({ page }) => {
  await mockApi(page, { lmStudioOnline: true });

  await page.goto("/");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Use light theme" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("theme"))).toBe("dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "Use light theme" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "dark");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("theme"))).toBe("light");
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

  await page.getByRole("button", { name: "Prepare run" }).click();
  await expect(page.locator("#preparedPrompt")).toHaveValue("");
  await expect(page.locator("#preparedPaths")).toContainText("No run slot prepared yet.");
  await expect(page.locator("#copyPrompt")).toBeDisabled();
});

test("supports prompt comparison and video-only run details", async ({ page }) => {
  let openHtmlPayload: unknown;
  let copiedText = "";
  await page.exposeFunction("recordClipboardWrite", (value: string) => {
    copiedText = String(value);
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: (value: string) =>
          (window as unknown as { recordClipboardWrite: (text: string) => Promise<void> }).recordClipboardWrite(
            value
          )
      },
      configurable: true
    });
  });
  await mockApi(page, {
    lmStudioOnline: true,
    onOpenHtml: (payload) => {
      openHtmlPayload = payload;
    },
    runs: [
      sampleRunWithVideo,
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
  await expect(page.locator("#detailPreview iframe")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Load live preview" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open HTML" })).toBeVisible();
  await page.getByRole("button", { name: "Open HTML" }).click();
  await expect.poll(() => openHtmlPayload).toMatchObject({
    runDirectory: sampleRunWithVideo.runDirectory,
    asset: "index.html"
  });
  await expect(page.locator("#detailPreview video")).toHaveAttribute("src", /preview\.webm$/);
  await expect(page.getByText("Create a sakura animation")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy prompt" })).toBeVisible();
  await page.getByRole("button", { name: "Copy prompt" }).click();
  await expect.poll(() => copiedText).toBe(benchmarks[0].prompt);
  await expect(page.getByRole("heading", { name: "Run folder" })).toBeVisible();
  await expect(page.locator("#detailRunFolderPath")).toHaveText(sampleRunWithVideo.runDirectory);
  await expect(page.locator("#detailBackdrop")).not.toContainText("HTML source:");
  await expect(page.locator("#detailBackdrop")).not.toContainText("Preview:");
  await expect(page.locator("#detailBackdrop")).not.toContainText("Video:");
  await page.getByRole("button", { name: "Copy path" }).click();
  await expect.poll(() => copiedText).toBe(sampleRunWithVideo.runDirectory);
  await expect(page.getByRole("link", { name: "Prompt file" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Raw response" })).toHaveCount(0);
  await expect(page.locator("#detailMeta")).not.toContainText("Tool");
  await expect(page.locator("#detailMeta")).not.toContainText("Error");
  await page.locator("#closeDetail").click();

  await page.locator("[data-run-id]").nth(1).click();
  await expect(page.locator("#detailPreview video")).toHaveCount(0);
  await expect(page.locator("#detailPreview")).toContainText("Video not captured yet");
  await expect(page.locator("#detailPreview")).toContainText("Use Capture media");
});

test("recaptures media for the open run detail", async ({ page }) => {
  let capturePayload: unknown;
  let runsResponse: unknown[] = [sampleRunWithVideo];
  await mockApi(page, {
    lmStudioOnline: true,
    runs: () => runsResponse,
    onCapture: (payload) => {
      capturePayload = payload;
      runsResponse = [
        {
          ...sampleRunWithVideo,
          updatedAt: "2026-05-06T20:00:00.000Z"
        }
      ];
    }
  });

  await page.goto("/");
  await page.waitForSelector("[data-run-id]", { timeout: 5000 });
  await page.locator("[data-run-id]").first().click();
  await expect(page.getByRole("button", { name: "Recapture media" })).toBeVisible();

  await page.getByRole("button", { name: "Recapture media" }).click();

  await expect.poll(() => capturePayload).toMatchObject({
    runDirectory: sampleRunWithVideo.runDirectory,
    force: true
  });
  await expect(page.locator("#detailPreview video")).toHaveAttribute("src", /preview\.webm$/);

  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.locator("[data-run-id]").first()).not.toContainText("Capturing");
  await expect(page.locator("[data-run-id]").first()).toContainText("Video ready");
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
  await expect(page.locator("#runsSurface")).toHaveCSS("overflow-y", "visible");
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

test("uses dense Sidequests-style gallery geometry on desktop", async ({ page }) => {
  const manyRuns = Array.from({ length: 9 }, (_, index) => ({
    ...sampleRunWithVideo,
    runId: `2026-05-06T21-${String(index).padStart(2, "0")}-00-000Z`,
    benchmark: index % 2 === 0 ? benchmarks[0] : benchmarks[1],
    model: index % 3 === 0
      ? { id: models[0].id, slug: "google-gemma-4-e4b" }
      : { id: models[1].id, slug: "local-qwen2-5-vl" },
    runDirectory: `/tmp/runs/dense/${index}`
  }));
  await mockApi(page, { lmStudioOnline: true, runs: manyRuns });
  await page.setViewportSize({ width: 1600, height: 900 });

  await page.goto("/");
  await page.waitForSelector("[data-run-id]", { timeout: 5000 });

  const galleryColumns = await page.locator(".run-grid").first().evaluate((el) =>
    getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length
  );
  expect(galleryColumns).toBe(4);

  const summaryBox = await page.locator(".gallery-summary").boundingBox();
  expect(summaryBox?.height ?? Infinity).toBeLessThanOrEqual(52);

  const firstCardBox = await page.locator("[data-run-id]").first().boundingBox();
  expect(firstCardBox?.height ?? Infinity).toBeLessThanOrEqual(292);

  await page.getByRole("button", { name: "By model" }).click();

  const groupHeadBox = await page.locator(".group-head").first().boundingBox();
  expect(groupHeadBox?.height ?? Infinity).toBeLessThanOrEqual(48);

  const groupedColumns = await page.locator(".group .run-grid").first().evaluate((el) =>
    getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length
  );
  expect(groupedColumns).toBe(4);
});

test("scrolls grouped views from the page margins instead of trapping the grid", async ({ page }) => {
  const manyRuns = Array.from({ length: 30 }, (_, index) => ({
    ...sampleRunWithVideo,
    runId: `2026-05-06T22-${String(index).padStart(2, "0")}-00-000Z`,
    benchmark: index % 2 === 0 ? benchmarks[0] : benchmarks[1],
    model: index % 3 === 0
      ? { id: models[0].id, slug: "google-gemma-4-e4b" }
      : { id: models[1].id, slug: "local-qwen2-5-vl" },
    runDirectory: `/tmp/runs/group-scroll/${index}`
  }));
  await mockApi(page, { lmStudioOnline: true, runs: manyRuns });
  await page.setViewportSize({ width: 1600, height: 900 });

  await page.goto("/");
  await page.waitForSelector("[data-run-id]", { timeout: 5000 });
  await page.getByRole("button", { name: "By model" }).click();

  await expect(page.locator("#runsSurface")).toHaveCSS("overflow-y", "visible");

  const beforePageScroll = await page.evaluate(() => window.scrollY);
  await page.mouse.move(1260, 420);
  await page.mouse.wheel(0, 650);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(beforePageScroll);
});

test("captures missing run media with per-card progress", async ({ page }) => {
  let captureCalled = false;
  let releaseCapture: () => void = () => {};
  const captureMayFinish = new Promise<void>((resolve) => {
    releaseCapture = resolve;
  });
  let runsResponse: unknown[] = [sampleRun];
  await mockApi(page, {
    lmStudioOnline: true,
    runs: () => runsResponse,
    onCapture: async (payload) => {
      expect(payload).toMatchObject({ runDirectory: sampleRun.runDirectory });
      captureCalled = true;
      await captureMayFinish;
      runsResponse = [sampleRunWithVideo];
    }
  });

  await page.goto("/");
  await page.waitForSelector("[data-run-id]", { timeout: 5000 });
  await expect(page.locator("[data-run-id]").first()).toContainText("VID —");

  await page.getByRole("button", { name: "Capture media" }).click();

  await expect.poll(() => captureCalled).toBe(true);
  await expect(page.locator("[data-run-id]").first()).toContainText("Capturing");
  await expect(page.locator("#runSummary")).toContainText("Capturing 1/1");

  releaseCapture();
  await expect(page.locator("[data-run-id]").first()).toContainText("VID ✓");
});

test("shows capture quality failures instead of hiding them behind capture prompts", async ({ page }) => {
  await mockApi(page, {
    lmStudioOnline: true,
    runs: [
      {
        ...sampleRun,
        status: "failed",
        error: {
          message: "Captured animation rendered too slowly: 3.0 FPS at 1280x720."
        },
        capture: {
          preview: {
            status: "ready",
            path: "preview.png",
            capturedAt: "2026-05-06T20:00:00.000Z"
          },
          video: {
            status: "failed",
            path: "preview.webm",
            capturedAt: "2026-05-06T20:00:00.000Z",
            error: {
              message: "Captured animation rendered too slowly: 3.0 FPS at 1280x720."
            }
          }
        }
      }
    ]
  });

  await page.goto("/");
  await page.waitForSelector("[data-run-id]", { timeout: 5000 });

  await expect(page.locator("[data-run-id]").first()).toContainText("failed");
  await expect(page.locator("[data-run-id]").first()).toContainText("Captured animation rendered too slowly");
  await expect(page.locator("[data-run-id]").first()).not.toContainText("Needs media capture");
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

test("hides operational chrome when writes are disabled", async ({ page }) => {
  await mockApi(page, { lmStudioOnline: true, writesEnabled: false });

  await page.goto("/");
  await expect(page.locator("[data-run-id]").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Prepare run" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Setup" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Capture media" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refresh" })).toHaveCount(0);
  await expect(page.locator("#statsPill")).toBeHidden();
  await expect(page.getByRole("button", { name: "Use dark theme" })).toBeVisible();
  await expect(page.locator("#themeLabel")).toHaveClass(/sr-only/);

  await page.locator("[data-run-id]").first().click();
  await expect(page.getByRole("button", { name: "Open HTML" })).toHaveCount(0);
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
            ...sampleRunWithVideo,
            runDirectory:
              "export/runs/sakura/local-qwen2-5-vl/2026-05-06T19-12-00-000Z",
            assets: {
              metadata: "metadata.json",
              prompt: "prompt.md",
              preview: "preview.png",
              video: "preview.webm"
            }
          }
        ]
      })
    });
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Prepare run" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Setup" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Capture media" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refresh" })).toHaveCount(0);
  await expect(page.locator("#statsPill")).toBeHidden();
  await expect(page.getByRole("button", { name: "Use dark theme" })).toBeVisible();
  await expect(page.locator("#themeLabel")).toHaveClass(/sr-only/);
  await expect(page.locator("[data-run-id]").first()).toBeVisible();

  await page.locator("[data-run-id]").first().click();
  await expect(page.getByRole("button", { name: "Recapture media" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Capture media" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Load live preview" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open HTML" })).toHaveCount(0);
  await expect(page.locator("#detailPreview video")).toHaveAttribute("src", /preview\.webm$/);
});

async function mockApi(
  page: Page,
  options: {
    lmStudioOnline: boolean;
    benchmarks?: () => typeof benchmarks;
    runs?: unknown[] | (() => unknown[]);
    onPrepare?: (payload: unknown) => void;
    onDelete?: (payload: unknown) => void;
    onCapture?: (payload: unknown) => void | Promise<void>;
    onOpenHtml?: (payload: unknown) => void | Promise<void>;
    writesEnabled?: boolean;
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
        app: { status: "ok", writesEnabled: options.writesEnabled ?? true },
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

  await page.route("**/api/capture-media", async (route) => {
    const payload = route.request().postDataJSON();
    await options.onCapture?.(payload);
    const runs = typeof options.runs === "function" ? options.runs() : options.runs;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ captured: 1, skipped: 0, failed: 0, runs: runs ?? [sampleRunWithVideo] })
    });
  });

  await page.route("**/api/open-html", async (route) => {
    const payload = route.request().postDataJSON();
    await options.onOpenHtml?.(payload);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        opened: true,
        path: payload.runDirectory + "/" + payload.asset
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
