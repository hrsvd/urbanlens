import { expect, test } from "@playwright/test";

async function waitForMap(page: import("@playwright/test").Page) {
  await expect(page.locator(".maplibregl-canvas")).toBeVisible({ timeout: 25_000 });
  await expect(page.locator(".map-loader")).toBeHidden({ timeout: 15_000 });
}

test("homepage loads the real map artifact", async ({ page }) => {
  await page.goto("/");
  await waitForMap(page);
  // Brand link in map-experience
  await expect(page.locator("a.brand")).toBeVisible();
  await expect(page.getByLabel("Toggle 3d buildings")).toBeVisible();
});

test("selecting a geographic point opens cell evidence", async ({ page }) => {
  await page.goto("/");
  await waitForMap(page);
  const canvas = page.locator(".maplibregl-canvas");
  await expect(canvas).toBeVisible();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Map canvas has no bounds");
  await page.mouse.click(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.54);
  const panel = page.getByLabel("Selected cell intelligence");
  await expect(panel).toBeVisible();
  // Panel header is always present once a cell is selected
  await expect(page.locator(".panel-topbar")).toBeVisible();
  // Score section appears once dynamic metrics load
  await expect(page.locator(".score-hero")).toBeVisible({ timeout: 20_000 });
  // Evidence row link is present once metrics load
  const evidenceLink = page.locator(".evidence-row a").first();
  await expect(evidenceLink).toBeVisible({ timeout: 20_000 });
});

test("local search focuses a named place and clarifies cell context", async ({ page }) => {
  await page.goto("/");
  await waitForMap(page);
  // Use the search bar form input directly
  const input = page.locator(".search-bar input");
  await expect(input).toBeVisible();
  await input.fill("park");
  const result = page.locator(".search-results > button").first();
  await expect(result).toBeVisible();
  await result.click();
  const context = page.locator(".place-context");
  await expect(context).toBeVisible({ timeout: 15_000 });
  await expect(context).toContainText("Showing cell-level metrics for the area containing");
});

test("heatmap control changes metric surface", async ({ page }) => {
  await page.goto("/");
  await waitForMap(page);
  const toggle = page.getByLabel("Toggle heatmap");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const select = page.getByLabel("Surface");
  await select.selectOption("floodSusceptibility");
  await expect(select).toHaveValue("floodSusceptibility");
});

test("transparency pages load", async ({ page }) => {
  await page.goto("/methodology");
  await expect(page.getByRole("heading", { name: "An indicator, not a verdict." })).toBeVisible();
  await page.goto("/data-sources");
  await expect(page.getByRole("heading", { name: "Evidence has an address." })).toBeVisible();
  await expect(page.getByText("OpenStreetMap contributors", { exact: true }).first()).toBeVisible();
});

test("mobile selection uses a bottom sheet", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.goto("/");
  await waitForMap(page);
  const canvas = page.locator(".maplibregl-canvas");
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Map canvas has no bounds");
  await page.mouse.click(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5);
  const panel = page.getByLabel("Selected cell intelligence");
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box?.width).toBeGreaterThan(350);
  expect(box?.y).toBeGreaterThan(100);
});
