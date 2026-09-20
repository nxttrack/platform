import { expect, test, type Locator, type Page } from "@playwright/test";

for (const width of [390, 768]) {
  test(`40 intake programs stay inside a ${width}px viewport and the wizard remains usable`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/test-harness/intake-responsive");
    await expect(page.locator("[data-intake-wizard]")).toHaveAttribute("data-hydrated", "true");
    const programs = page.getByRole("navigation", { name: "Kies programma" }).filter({ visible: true });
    await expect(programs.getByRole("link")).toHaveCount(40);
    await expectNoPageOverflow(page);
    const scroll = await programs.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
    expect(scroll.scroll).toBeGreaterThan(scroll.client);
    await programs.getByRole("link").last().scrollIntoViewIfNeeded();
    await expectWithinViewport(programs.getByRole("link").last(), width);
    await expectNoPageOverflow(page);
    await page.getByLabel("Naam kind", { exact: true }).fill("Fictieve leerling");
    await page.getByLabel("Geboortedatum kind", { exact: true }).fill("2018-01-01");
    await page.getByText("Niet ingevuld", { exact: true }).click();
    await page.getByText("Inschrijven", { exact: true }).click();
    const next = page.getByRole("button", { name: "Volgende", exact: true });
    await expect(next).toBeEnabled();
    await next.scrollIntoViewIfNeeded();
    await expectWithinViewport(next, width);
    await next.click();
    await expect(page.getByLabel("Naam ouder/verzorger 1", { exact: true })).toBeVisible();
    await expectNoPageOverflow(page);
    await testInfo.attach(`intake-40-programs-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  });

  test(`planning and instructor controls stay inside a ${width}px viewport`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/test-harness/intake-responsive?surface=planning");
    await expectNoPageOverflow(page);
    const lesson = page.getByRole("button", { name: /Sprint 4 Admin Groep/ });
    await expectWithinViewport(lesson, width);
    await lesson.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoPageOverflow(page);
    await testInfo.attach(`planning-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

    await page.goto("/test-harness/intake-responsive?surface=instructor");
    await page.getByLabel("Lesnotitie voor Fictieve leerling", { exact: true }).fill("Fictieve lesnotitie");
    await page.getByLabel("Interne notitie voor Fictieve leerling", { exact: true }).fill("Fictieve focusnotitie");
    await expectNoPageOverflow(page);
    await expectWithinViewport(page.getByRole("button", { name: "Opslaan", exact: true }), width);
    await expectWithinViewport(page.getByRole("button", { name: "Notitie toevoegen voor Fictieve leerling", exact: true }), width);
    await testInfo.attach(`instructor-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  });
}

async function expectNoPageOverflow(page: Page) {
  const measured = await page.evaluate(() => ({ width: window.innerWidth, content: document.documentElement.scrollWidth }));
  expect(measured.content, `document width ${measured.content}, viewport ${measured.width}`).toBeLessThanOrEqual(measured.width + 1);
}

async function expectWithinViewport(locator: Locator, width: number) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
}
