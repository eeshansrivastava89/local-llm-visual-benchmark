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
  {
    id: "google/gemma-4-e4b",
    localPath: "/Users/test/.lmstudio/models/lmstudio-community/gemma-4-E4B-it-GGUF/gemma-4-E4B-it-Q8_0.gguf"
  },
  {
    id: "local/qwen2.5-vl",
    localPath: "/Users/test/.lmstudio/models/local/qwen2.5-vl/model.gguf"
  }
];

const omlxModels = [
  {
    id: "Qwen3.6-35B-A3B-4bit"
  }
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
  },
  capture: {
    preview: {
      status: "ready",
      path: "preview.png",
      capturedAt: "2026-05-06T19:13:00.000Z"
    },
    video: {
      status: "ready",
      path: "preview.webm",
      capturedAt: "2026-05-06T19:13:00.000Z"
    }
  }
};

const sampleUnsupportedRun = {
  runId: "2026-05-10T03-11-10-113Z",
  benchmark: {
    id: "boolq-0",
    title: "Deprecated quantitative task",
    description: "Unsupported quantitative task metadata.",
    prompt: "boolq|0"
  },
  model: {
    id: "google/gemma-4-e4b",
    slug: "google-gemma-4-e4b-bae096a7fc"
  },
  kind: "lighteval",
  runner: {
    mode: "lighteval",
    intendedRunner: "Deprecated quantitative runner",
    backendLabel: "Deprecated quantitative runner",
    baseUrl: "http://localhost:1234/v1",
    model: "google/gemma-4-e4b",
    launchCommand: "quantitative-runner boolq|0",
    commandAsset: "command.txt",
    metricSource: "Deprecated quantitative result",
    retries: 0,
    tokenMetrics: {
      reported: false
    }
  },
  status: "prepared",
  createdAt: "2026-05-10T03:11:10.113Z",
  updatedAt: "2026-05-10T03:11:10.113Z",
  runDirectory:
    "/tmp/runs/boolq-0/google-gemma-4-e4b-bae096a7fc/2026-05-10T03-11-10-113Z",
  assets: {
    metadata: "metadata.json",
    command: "command.txt"
  }
};

test("renders the visual workbench with prompt/model/table modes", async ({ page }) => {
  await mockApi(page, { lmStudioOnline: true });

  await page.goto("/");
  await page.waitForSelector("[data-run-id]", { timeout: 5000 });

  await expect(
    page.getByRole("heading", { name: "Local LLM Visual Benchmark" })
  ).toBeVisible();
  await expect(page.getByText("Browse visual benchmark outputs by prompt, model, or table.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Prepare run" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Capture media" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Setup" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use dark theme" })).toBeVisible();
  await expect(page.getByRole("button", { name: "LM Studio" })).toHaveCount(0);
  await expect(page.locator(".app-header #omlxStatusPill")).toHaveCount(0);
  await expect(page.locator(".app-header #lmStudioStatusPill")).toHaveCount(0);
  const attribution = page.getByRole("link", { name: "a side quest by eeshans.com" });
  await expect(attribution).toHaveAttribute("href", "https://eeshans.com/");
  await expect(attribution).toHaveCSS("border-radius", "999px");
  await expect(page.getByLabel("Filter by model")).toBeVisible();
  await expect(page.getByLabel("Filter by prompt")).toBeVisible();
  await expect(page.getByRole("link", { name: /Gallery Visual outputs/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Runs Metadata & files/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /LightEval/i })).toHaveCount(0);
  await expect(page.locator("[data-section]")).toHaveCount(0);
  await expect(page.locator("[data-mode]")).toHaveText(["By prompt", "By model", "Table", "Compare"]);
  await expect(page.getByRole("button", { name: "By prompt" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "By model" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Table" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("heading", { name: "Prompt comparison" })).toBeVisible();
  await expect(page.getByText("0 with video, 1 need capture, 0 prepared, 0 failed")).toBeVisible();
  await expect(page.locator(".run-grid")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sakura Particle Field" })).toBeVisible();
  await expect(page.locator("[data-run-id]").first()).toContainText("local/qwen2.5-vl");
  await expect(page.getByLabel("Search runs")).toBeVisible();
  await expect(page.locator("#runsFilterPanel")).toHaveCount(0);
  await page.getByLabel("Search runs").fill("no matching run");
  await expect(page.locator("[data-run-id]")).toHaveCount(0);
  await page.getByLabel("Search runs").fill("");
  await page.locator("[data-run-id]").first().click();
  await expect(page.getByRole("dialog", { name: "Run detail" })).toBeVisible();
  await expect(page.locator("#detailMeta")).toContainText("State");
  await expect(page.locator("#detailMeta")).toContainText("capture");
  await expect(page.locator("#detailArtifacts")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Capture preview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open in Finder" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "By model" }).click();
  await expect(page.locator("#runsFilterPanel")).toHaveCount(0);
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
  await expect(page.getByRole("heading", { name: "Model sources" })).toBeVisible();
  await expect(page.getByLabel("oMLX base URL")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Model inventory" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sync Pi" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sync OpenCode" })).toBeVisible();
  await expect(page.locator("#lmConfigPi .sync-target-logo")).toBeVisible();
  await expect(page.locator("#lmConfigOpenCode .sync-target-logo")).toBeVisible();
  await expect(page.getByText("OpenCode Setup")).toHaveCount(0);
  await expect(page.getByText("Pi Setup")).toHaveCount(0);
  // Phase 2: onboarding uses data-onboarding-step, not data-step
  await expect(page.locator("[data-step]")).toHaveCount(0);
  await expect(page.getByText("Pi synced").first()).toBeVisible();
  await expect(page.getByText("OpenCode synced").first()).toBeVisible();
  await expect(page.getByText("/home/.pi/agent/models.json")).toBeVisible();
  await expect(page.locator("#availableModelChoices").getByText("oMLX").first()).toBeVisible();
  await expect(page.locator("#availableModelChoices").getByText("LM Studio").first()).toBeVisible();
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

  await page.locator("#refreshConnection").click();
  await expect(page.locator("#connectionMessage")).toContainText("2 models discovered");
});

test("compares selected visual runs side by side", async ({ page }) => {
  const compareRuns = [
    {
      ...sampleRunWithVideo,
      runner: {
        mode: "external",
        modelSource: "omlx",
        intendedRunner: "opencode",
        backendLabel: "oMLX"
      }
    },
    {
      ...sampleRunWithVideo,
      runId: "2026-05-06T20-12-00-000Z",
      updatedAt: "2026-05-06T20:13:00.000Z",
      runDirectory: "/tmp/runs/sakura/local-qwen2-5-vl/2026-05-06T20-12-00-000Z",
      model: {
        id: "local/qwen2.5-vl",
        slug: "local-qwen2-5-vl"
      },
      runner: {
        mode: "manual",
        modelSource: "lmstudio",
        intendedRunner: "manual",
        backendLabel: "LM Studio"
      }
    }
  ];
  await mockApi(page, { lmStudioOnline: true, runs: compareRuns });

  await page.goto("/");
  await page.getByRole("button", { name: "Compare" }).click();

  await expect(page.getByRole("heading", { name: "Compare runs" })).toBeVisible();
  await expect(page.locator("#viewSubtitle")).toHaveText("Select 2-4 visual runs for side-by-side inspection.");
  await page.getByRole("checkbox", { name: /Select Sakura Particle Field.*oMLX.*opencode/ }).check();
  await page.getByRole("checkbox", { name: /Select Sakura Particle Field.*LM Studio.*manual/ }).check();

  await expect(page.getByText("2 selected")).toBeVisible();
  await expect(page.locator("[data-compare-run]")).toHaveCount(2);
  const selectedCompareRunsRegion = page.getByLabel("Selected compare runs");
  await expect(selectedCompareRunsRegion.getByText("local/qwen2.5-vl · oMLX · opencode")).toBeVisible();
  await expect(selectedCompareRunsRegion.getByText("local/qwen2.5-vl · LM Studio · manual")).toBeVisible();
  await expect(page.locator("[data-compare-run] video")).toHaveCount(2);
});

test("paginates the table mode at 25 records", async ({ page }) => {
  const manyRuns = Array.from({ length: 30 }, (_, index) => ({
    ...sampleRun,
    runId: `2026-05-06T20-${String(index).padStart(2, "0")}-00-000Z`,
    benchmark: index % 2 === 0 ? benchmarks[0] : benchmarks[1],
    model: index % 3 === 0
      ? { id: models[0].id, slug: "google-gemma-4-e4b" }
      : { id: models[1].id, slug: "local-qwen2-5-vl" },
    runDirectory: `/tmp/runs/page/${index}`
  }));
  await mockApi(page, { lmStudioOnline: true, runs: manyRuns });

  await page.goto("/");
  await page.getByRole("button", { name: "Table" }).click();
  await page.waitForSelector("[data-run-id]", { timeout: 5000 });

  await expect(page.locator(".runs-table [data-run-id]")).toHaveCount(25);
  await expect(page.locator(".runs-pagination")).toContainText("Showing 1-25 of 30");
  await expect(page.locator(".runs-pagination")).toContainText("Page 1 of 2");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.locator(".runs-table [data-run-id]")).toHaveCount(5);
  await expect(page.locator(".runs-pagination")).toContainText("Showing 26-30 of 30");
  await expect(page.locator(".runs-pagination")).toContainText("Page 2 of 2");
  await page.getByRole("button", { name: "Previous" }).click();
  await expect(page.locator(".runs-table [data-run-id]")).toHaveCount(25);
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
  await expect(page.locator(".prep-header-actions #omlxStatusPill")).toHaveCount(1);
  await expect(page.locator(".prep-header-actions #lmStudioStatusPill")).toHaveCount(1);
  await expect(page.locator("#omlxStatusPill")).toHaveAttribute("data-status", "online");
  await expect(page.locator("#omlxStatusPill")).toContainText("oMLX 1");
  await expect(page.locator("#omlxStatusPill")).not.toHaveAttribute("tabindex", "0");
  await expect(page.locator("#lmStudioStatusPill")).toHaveAttribute("data-status", "online");
  await expect(page.locator("#lmStudioStatusPill")).toContainText("LM Studio 2");
  await expect(page.locator("#helpTooltip")).toBeHidden();
  await expect(page.locator("#prepModel")).toHaveCount(0);
  await page.locator("#prepBackdrop").locator("#prepBenchmark").selectOption("solar-system");
  await page.locator("#prepBackdrop").locator("#prepModelSource").selectOption("omlx");
  await page.locator("#prepBackdrop").locator("#prepModelSelect").selectOption("Qwen3.6-35B-A3B-4bit");
  await expect(page.locator("label", { hasText: "Model label" })).toHaveCount(0);
  await page.locator("#prepBackdrop").getByRole("button", { name: "Prepare slot" }).click();

  await expect.poll(() => preparePayload).toMatchObject({
    benchmarkId: "solar-system",
    modelId: "Qwen3.6-35B-A3B-4bit",
    modelSource: "omlx",
    runner: "manual"
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
  expect(promptBox?.height ?? 0).toBeGreaterThanOrEqual(300);

  await page.locator("#closePrep").click();
  await expect(page.locator("[data-run-id]").first()).toBeVisible();

  await page.getByRole("button", { name: "Prepare run" }).click();
  await expect(page.locator("#preparedPrompt")).toHaveValue("");
  await expect(page.locator("#preparedPaths")).toContainText("No run slot prepared yet.");
  await expect(page.locator("#copyPrompt")).toBeDisabled();
});

test("prepares LM Studio runs without exposing llama.cpp command controls", async ({ page }) => {
  const preparePayloads: unknown[] = [];
  await mockApi(page, {
    lmStudioOnline: true,
    onPrepare: (payload) => {
      preparePayloads.push(payload);
    }
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Prepare run" }).click();

  await expect(page.locator("#prepKind")).toHaveCount(0);
  await expect(page.locator("#prepLightEvalFields")).toHaveCount(0);
  await expect(page.locator("#prepRunner option[value='llama-cpp']")).toHaveCount(0);
  await expect(page.locator("#prepBaseUrl")).toHaveCount(0);
  await expect(page.locator("#prepCommand")).toHaveCount(0);
  await page.locator("#prepRunner").selectOption("opencode");
  await page.locator("#prepModelSource").selectOption("lmstudio");
  await page.locator("#prepModelSelect").selectOption(models[1].id);
  await page.locator("#prepBackdrop").getByRole("button", { name: "Prepare slot" }).click();

  await expect.poll(() => preparePayloads.at(-1)).toMatchObject({
    kind: "visual",
    runner: "opencode",
    modelSource: "lmstudio",
    baseUrl: "http://localhost:1234/v1",
    modelId: models[1].id
  });
  await expect(page.locator("#preparedPaths")).toContainText("Run slot prepared");
  await expect(page.locator("#preparedPaths")).not.toContainText("command.txt");
});

test("warns in the prepare modal when the selected model source is offline", async ({ page }) => {
  await mockApi(page, { lmStudioOnline: false });

  await page.goto("/");
  await page.getByRole("button", { name: "Prepare run" }).click();

  await expect(page.locator("#prepBackdrop[open]")).toBeVisible();
  await expect(page.locator("#omlxStatusPill")).toHaveAttribute("data-status", "online");
  await expect(page.locator("#lmStudioStatusPill")).toHaveAttribute("data-status", "offline");
  await expect(page.locator("#lmStudioStatusPill")).toContainText("LM Studio off");

  await page.locator("#prepModelSource").selectOption("lmstudio");

  await expect(page.locator("#prepModelSelect option").first()).toHaveText("LM Studio offline");
  await expect(page.locator("#prepModelWarning")).toBeVisible();
  await expect(page.locator("#prepModelWarning")).toContainText("LM Studio is not reachable");
  await expect(page.locator("#prepareRun")).toBeDisabled();
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
  await expect(page.getByRole("button", { name: "Open in Finder" })).toBeVisible();
  await page.getByRole("button", { name: "Open HTML" }).click();
  await expect.poll(() => openHtmlPayload).toMatchObject({
    runDirectory: sampleRunWithVideo.runDirectory,
    asset: "index.html"
  });
  await expect(page.locator("#detailPreview video")).toHaveAttribute("src", /preview\.webm.*v=2026-05-06T19%3A13%3A00\.000Z/);
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
  await expect(page.locator("#detailPreview img")).toHaveAttribute("src", /preview\.png.*v=2026-05-06T19%3A13%3A00\.000Z/);
  await expect(page.locator("#detailPreview")).not.toContainText("Video not captured yet");
});

test("hides unsupported non-visual runs from visual workspaces", async ({ page }) => {
  await mockApi(page, {
    lmStudioOnline: true,
    runs: [sampleRun, sampleUnsupportedRun]
  });

  await page.goto("/");
  await page.waitForSelector("[data-run-id]", { timeout: 5000 });
  await expect(page.locator("[data-run-id]")).toHaveCount(1);
  await expect(page.locator("body")).not.toContainText("Deprecated quantitative task");
  await expect(page.getByRole("link", { name: /LightEval/i })).toHaveCount(0);

  await page.goto("/");
  await page.getByRole("button", { name: "Table" }).click();
  await page.waitForSelector("[data-run-id]", { timeout: 5000 });
  await expect(page.locator("[data-run-id]")).toHaveCount(1);
  await expect(page.locator("body")).not.toContainText("Deprecated quantitative task");
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
          updatedAt: "2026-05-06T20:00:00.000Z",
          capture: {
            preview: {
              status: "ready",
              path: "preview.png",
              capturedAt: "2026-05-06T20:00:00.000Z"
            },
            video: {
              status: "ready",
              path: "preview.webm",
              capturedAt: "2026-05-06T20:00:00.000Z"
            }
          }
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
  await expect(page.locator("#detailPreview video")).toHaveAttribute("src", /preview\.webm.*v=2026-05-06T20%3A00%3A00\.000Z/);
  await expect(page.locator("#detailPreview video")).toHaveAttribute("poster", /preview\.png.*v=2026-05-06T20%3A00%3A00\.000Z/);
  await expect(page.getByRole("button", { name: "Recapture media" })).toBeEnabled();

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
  await page.getByRole("button", { name: "By prompt" }).click();

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
  await expect(page.locator("[data-run-id]").first()).toContainText("Needs media capture");

  await page.getByRole("button", { name: /Capture preview for Sakura Particle Field/ }).click();

  await expect.poll(() => captureCalled).toBe(true);
  await expect(page.locator("[data-run-id]").first()).toContainText("Capturing");

  releaseCapture();
  await expect(page.locator("[data-run-id]").first()).toContainText("Video ready");
});

test("auto-detects newly saved HTML and starts capture from the toast", async ({ page }) => {
  let capturePayload: unknown;
  let runsResponse: unknown[] = [
    {
      ...sampleRun,
      status: "prepared",
      assets: {
        metadata: "metadata.json",
        prompt: "prompt.md"
      }
    }
  ];

  await page.addInitScript(() => {
    const realSetInterval = window.setInterval;
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
      realSetInterval(handler, timeout === 8000 ? 50 : timeout, ...args)) as typeof window.setInterval;
  });

  await mockApi(page, {
    lmStudioOnline: true,
    runs: () => runsResponse,
    onCapture: (payload) => {
      capturePayload = payload;
      runsResponse = [sampleRunWithVideo];
    }
  });

  await page.goto("/");
  await page.waitForSelector("[data-run-id]", { timeout: 5000 });
  await expect(page.locator("[data-run-id]").first()).toContainText("Waiting for index.html source");

  runsResponse = [
    {
      ...sampleRun,
      status: "prepared",
      assets: {
        metadata: "metadata.json",
        prompt: "prompt.md",
        html: "index.html"
      }
    }
  ];

  await expect(page.locator(".html-detect-toast")).toContainText("1 run has index.html ready.");
  await page.getByRole("button", { name: "Capture now" }).click();

  await expect.poll(() => capturePayload).toMatchObject({
    runDirectory: sampleRun.runDirectory
  });
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

test("deletes a run folder from the visual detail after confirmation", async ({ page }) => {
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
  await page.getByRole("button", { name: "Table" }).click();
  await page.waitForSelector("[data-run-id]", { timeout: 5000 });
  await page.locator("[data-run-id]").first().click();
  await expect(page.getByRole("dialog", { name: "Run detail" })).toBeVisible();
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

test("keeps visual detail prompt and run folder usable on mobile widths", async ({ page }) => {
  let copiedText = "";
  const longPrompt = Array.from({ length: 24 }, (_item, index) =>
    `Prompt instruction ${index + 1}: Create a sakura animation with layered petals and keep the full tree visible.`
  ).join("\n");
  const mobileRun = {
    ...sampleRunWithVideo,
    benchmark: {
      ...sampleRunWithVideo.benchmark,
      prompt: longPrompt
    }
  };
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
  await mockApi(page, { lmStudioOnline: true, runs: [mobileRun] });
  await page.setViewportSize({ width: 390, height: 900 });

  await page.goto("/");
  await page.waitForSelector("[data-run-id]", { timeout: 5000 });
  await expect(page.locator("#onboardingPanel")).toBeHidden();

  await page.locator("[data-run-id]").first().click();
  const detailDialog = page.locator("#detailBackdrop[open]");
  await expect(detailDialog).toBeVisible();
  await expect(detailDialog.getByRole("heading", { name: "Prompt", exact: true })).toBeVisible();
  await expect(detailDialog.getByRole("heading", { name: "Run folder" })).toBeVisible();
  await expect(page.locator("#detailRunFolderPath")).toHaveText(mobileRun.runDirectory);

  const promptScrolls = await page.locator("#detailPrompt").evaluate((element) =>
    element.scrollHeight > element.clientHeight
  );
  expect(promptScrolls).toBe(true);

  await page.getByRole("button", { name: "Copy path" }).click();
  await expect.poll(() => copiedText).toBe(mobileRun.runDirectory);

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
              preview: "preview.png",
              video: "preview.webm"
            }
          }
        ]
      })
    });
  });
  await page.route("**/export/runs/**/preview.png", async (route) => {
    await route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axwP18AAAAASUVORK5CYII=",
        "base64"
      )
    });
  });
  await page.route("**/export/runs/**/preview.webm", async (route) => {
    await route.fulfill({
      contentType: "video/webm",
      body: Buffer.from([])
    });
  });

  await page.goto("/");
  await expect(page.locator("body.public-page")).toHaveCount(0);
  await expect(page.locator(".public-header")).toHaveCount(0);
  await expect(page.locator("[data-mode]")).toHaveText(["By prompt", "By model", "Table", "Compare"]);
  await expect(page.getByRole("heading", { name: "Prompt comparison" })).toBeVisible();
  await expect(page.locator("#onboardingPanel")).toBeHidden();
  await expect(page.getByRole("button", { name: "Prepare run" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Setup" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Capture media" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refresh" })).toHaveCount(0);
  await expect(page.locator("#statsPill")).toBeHidden();
  await expect(page.getByRole("button", { name: "Use dark theme" })).toBeVisible();
  await expect(page.locator("#themeLabel")).toHaveClass(/sr-only/);
  await expect(page.locator("[data-run-id]").first()).toBeVisible();

  await page.locator("[data-run-id]").first().click();
  await expect(page.getByRole("dialog", { name: "Run detail" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Recapture media" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Capture media" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Load live preview" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open HTML" })).toHaveCount(0);
  await expect(page.locator("#detailPreview video")).toHaveAttribute("src", /preview\.webm.*v=2026-05-06T19%3A13%3A00\.000Z/);
});

async function mockApi(
  page: Page,
  options: {
    lmStudioOnline: boolean;
    omlxOnline?: boolean;
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

  await page.route("**/api/omlx/models**", async (route) => {
    if (options.omlxOnline === false) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            message: "oMLX listing models network error: failed to fetch"
          }
        })
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        baseUrl: "http://127.0.0.1:8000/v1",
        models: omlxModels
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

  await page.route("**/api/open-run-folder", async (route) => {
    const payload = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        opened: true,
        path: payload.runDirectory
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
    const runDirectory =
      "/tmp/runs/solar-system/google-gemma-4-e4b/2026-05-07T04-00-32-122Z";
    const benchmark = benchmarks.find((item) => item.id === payload.benchmarkId);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        preparedRun: {
          run: {
            runId: "2026-05-07T04-00-32-122Z",
            benchmark,
            model: {
              id: payload.modelId,
              slug: "google-gemma-4-e4b"
            },
            kind: "visual",
            runner: {
              mode: payload.runner === "manual" ? "manual" : "external",
              modelSource: payload.modelSource,
              intendedRunner: payload.runner ?? "manual",
              backendLabel: payload.modelSource === "omlx" ? "oMLX" : "LM Studio",
              baseUrl: payload.baseUrl
            },
            status: "prepared",
            createdAt: "2026-05-07T04:00:32.122Z",
            updatedAt: "2026-05-07T04:00:32.122Z",
            runDirectory,
            assets: {
              metadata: "metadata.json",
              prompt: "prompt.md"
            }
          },
          prompt: "Save one complete self-contained HTML document to: " + runDirectory + "/index.html",
          paths: {
            runDirectory,
            promptPath: runDirectory + "/prompt.md",
            commandPath: runDirectory + "/command.txt",
            htmlPath: runDirectory + "/index.html",
            metadataPath: runDirectory + "/metadata.json",
            previewPath: runDirectory + "/preview.png"
          }
        }
      })
    });
  });
}
