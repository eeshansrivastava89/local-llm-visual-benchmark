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
  { id: "local/qwen2.5-vl" },
  { id: "local/llava-next" }
];

const sampleRun = {
  runId: "2026-05-06T19-12-00-000Z",
  benchmark: benchmarks[0],
  model: {
    id: models[0].id,
    slug: "local-qwen2-5-vl"
  },
  status: "completed",
  createdAt: "2026-05-06T19:12:00.000Z",
  updatedAt: "2026-05-06T19:13:00.000Z",
  runDirectory: "/tmp/runs/sakura/local-qwen2-5-vl/2026-05-06T19-12-00-000Z",
  settings: {
    preview: {
      captureAtMs: 5000,
      viewport: {
        width: 1280,
        height: 720
      },
      video: false
    }
  },
  assets: {
    metadata: "metadata.json",
    rawResponse: "raw-response.txt",
    html: "index.html",
    preview: "preview.png"
  },
  capture: {
    preview: {
      status: "ready",
      path: "preview.png",
      capturedAt: "2026-05-06T19:13:00.000Z"
    },
    video: {
      status: "skipped",
      reason: "disabled"
    }
  }
};

test("renders control center and handles unreachable LM Studio", async ({ page }) => {
  await mockApi(page, { lmStudioOnline: false });

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Local LLM Visual Benchmark" })
  ).toBeVisible();
  await expect(page.getByLabel("LM Studio base URL")).toHaveValue(
    "http://localhost:1234/v1"
  );
  await expect(
    page.getByLabel("Connection").getByText("Offline", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("No models discovered")).toBeVisible();

  await page.getByRole("button", { name: "Test" }).click();

  await expect(page.getByText("Connection unavailable")).toBeVisible();
  await expect(page.getByText(/network error/i)).toBeVisible();
});

test("starts a mocked queue and opens run detail with PNG fallback", async ({
  page
}) => {
  let startPayload: unknown;
  await mockApi(page, {
    lmStudioOnline: true,
    onStart: (payload) => {
      startPayload = payload;
    }
  });

  await page.goto("/");

  await expect(page.getByText("2 benchmarks")).toBeVisible();
  await expect(page.getByText("2 models")).toBeVisible();

  await page.getByLabel("Solar System Orrery").check();
  await page.getByLabel("local/llava-next").check();
  await page.getByLabel("Repeats").fill("2");
  await page.getByLabel("PNG timestamp").fill("3500");
  await page.getByLabel("Video generation").check();
  await page.getByRole("button", { name: "Start" }).click();

  await expect
    .poll(() => startPayload)
    .toMatchObject({
      benchmarkIds: ["sakura", "solar-system"],
      modelIds: ["local/qwen2.5-vl", "local/llava-next"],
      repeatCount: 2,
      capture: {
        preview: {
          captureAtMs: 3500,
          video: true
        }
      },
      baseUrl: "http://localhost:1234/v1"
    });
  await expect(page.getByText("sakura / local/qwen2.5-vl")).toBeVisible();

  await page.getByRole("button", { name: "Video" }).click();
  await expect(page.getByText("Video missing, showing PNG")).toBeVisible();

  await page.getByRole("button", { name: /Sakura Particle Field/ }).click();
  await expect(page.getByRole("dialog", { name: "Run detail" })).toBeVisible();
  await expect(page.getByText("Create a sakura animation")).toBeVisible();
  await expect(page.getByRole("link", { name: "Raw response" })).toHaveAttribute(
    "href",
    /raw-response\.txt$/
  );
  await expect(page.getByRole("link", { name: "Open HTML" })).toHaveAttribute(
    "href",
    /index\.html$/
  );
});

test("keeps the control center usable on mobile widths", async ({ page }) => {
  await mockApi(page, { lmStudioOnline: false, runs: [] });
  await page.setViewportSize({ width: 390, height: 900 });

  await page.goto("/");

  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
  await expect(page.getByText("No runs yet")).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflow).toBe(false);
});

test("falls back to exported static data when local API is unavailable", async ({
  page
}) => {
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

  await expect(
    page.getByLabel("Connection").getByText("Static mode", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("2 benchmarks")).toBeVisible();
  await expect(page.getByText("1 run")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Sakura Particle Field/ })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Start" })).toBeDisabled();

  await page.getByRole("button", { name: /Sakura Particle Field/ }).click();
  await expect(page.getByRole("link", { name: "Open HTML" })).toHaveAttribute(
    "href",
    /export\/runs\/sakura\/local-qwen2-5-vl\/2026-05-06T19-12-00-000Z\/index\.html$/
  );
});

async function mockApi(
  page: Page,
  options: {
    lmStudioOnline: boolean;
    runs?: unknown[];
    onStart?: (payload: unknown) => void;
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
          platform: {
            node: "v25.6.0",
            platform: "darwin",
            arch: "arm64"
          },
          os: {
            type: "Darwin",
            release: "25.0.0",
            hostname: "local",
            uptimeSeconds: 1234
          },
          cpu: {
            model: "Apple M",
            cores: 12,
            loadAverage: [1.2, 1.5, 1.8]
          },
          memory: {
            totalBytes: 34359738368,
            freeBytes: 8589934592,
            usedBytes: 25769803776
          },
          gpu: {
            available: false,
            devices: [],
            reason: "GPU telemetry is unavailable in the local API v1."
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
        queue: {
          status: "idle",
          pendingJobs: [],
          completedJobs: [],
          failedJobs: [],
          skippedJobs: [],
          totalJobs: 0
        },
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

  await page.route("**/api/queue/start", async (route) => {
    const payload = route.request().postDataJSON();
    options.onStart?.(payload);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        queue: {
          status: "running",
          activeJob: {
            id: "sakura__local-qwen2-5-vl__repeat-1-of-2",
            benchmark: benchmarks[0],
            model: models[0],
            repeatIndex: 1,
            repeatTotal: 2,
            settings: payload.capture,
            status: "running"
          },
          pendingJobs: [],
          completedJobs: [],
          failedJobs: [],
          skippedJobs: [],
          totalJobs: 4
        }
      })
    });
  });

  await page.route("**/api/queue/stop-after-current", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        queue: {
          status: "stopping",
          pendingJobs: [],
          completedJobs: [],
          failedJobs: [],
          skippedJobs: [],
          totalJobs: 4
        }
      })
    });
  });

  await page.route("**/api/queue/cancel-now", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        queue: {
          status: "cancelled",
          pendingJobs: [],
          completedJobs: [],
          failedJobs: [],
          skippedJobs: [],
          totalJobs: 4
        }
      })
    });
  });
}
