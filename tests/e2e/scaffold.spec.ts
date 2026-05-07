import { expect, test } from "@playwright/test";

test("renders the scaffold page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Local LLM Visual Benchmark" })).toBeVisible();
});
