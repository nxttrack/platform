import { expect, test } from "@playwright/test";

test("development searches and restores filters, opens a focused dialog and keeps historical values distinct", async ({ page }) => {
  await page.goto("/test-harness/journey-development");
  const rows = page.locator("[data-development-skill]"); await expect(rows).toHaveCount(2);
  await page.getByRole("searchbox", { name: "Zoek onderdelen" }).fill("Ademen"); await expect(rows).toHaveCount(1);
  // The streamed page is usable before Firefox's aggregate load event; prove the
  // restored filter, rendered result and working dialog on the reloaded document.
  await page.reload({ waitUntil: "domcontentloaded" }); await expect(page.getByRole("searchbox", { name: "Zoek onderdelen" })).toHaveValue("Ademen"); await expect(rows).toHaveCount(1);
  const trigger = page.getByRole("button", { name: "Bekijk Ademen", exact: true }); await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Ademen", exact: true }); await expect(dialog).toBeVisible();
  await expect(dialog.getByText("3 / 5", { exact: true })).toHaveCount(2); // actual score and real mastery threshold
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  await page.getByRole("link", { name: "Historie", exact: true }).click();
  await expect(page.getByText("Correctie vastgelegd", { exact: true })).toBeVisible();
  await expect(page.getByText("Vervangen door een correctie", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Mijlpalen", exact: true }).click();
  const chapter = page.locator("article").filter({ has: page.getByRole("heading", { name: "Eerdere wereld", exact: true }) }); await chapter.getByRole("button", { name: "Bekijken", exact: true }).click();
  const memory = page.getByRole("dialog", { name: "Eerdere wereld", exact: true }); await expect(memory).toBeVisible();
  await expect(memory.getByText("Historisch onderdeel · 2 / 5", { exact: true })).toBeVisible();
  await expect(memory.getByText("Onbekende historische score · Score niet vastgelegd", { exact: true })).toBeVisible();
  await expect(memory.getByRole("link", { name: "Bekijk eerdere wereld" })).toHaveCount(0);
  await memory.getByRole("button", { name: "Venster sluiten" }).click();
  await page.getByRole("link", { name: "Onderdelen", exact: true }).click(); await expect(rows).toHaveCount(1);
  await page.getByRole("button", { name: "Wis filters", exact: true }).click(); await expect(rows).toHaveCount(2);
  await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("open"); await expect(rows).toHaveCount(1); await expect(rows).toContainText("Nog niet beoordeeld");
});

test("development retains readable long labels and reachable details across seven viewports and enlarged text", async ({ page }, info) => {
  for (const [width, height] of [[360, 800], [390, 844], [412, 915], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height }); await page.goto("/test-harness/journey-development");
    await expect(page.locator("[data-development-skill]")).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`development-${width}x${height}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  const trigger = page.getByRole("button", { name: /^Bekijk Rustig drijven/ }); await trigger.click();
  const dialog = page.getByRole("dialog", { name: /^Rustig drijven/ }); await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Venster sluiten" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await dialog.getByText("Nog niet beoordeeld", { exact: true }).first().scrollIntoViewIfNeeded();
  await expect(dialog.getByText("Nog niet beoordeeld", { exact: true }).first()).toBeInViewport();
  await expect(dialog.getByRole("button", { name: "Venster sluiten" })).toBeInViewport();
  await page.screenshot({ path: info.outputPath("development-390x844-text200-dialog.png") });
  await dialog.getByRole("button", { name: "Venster sluiten" }).click(); await expect(trigger).toBeFocused();
});
