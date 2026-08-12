import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { PORTAL_REQUIRED_VIEWPORTS } from "@/lib/theme/portal-visual-matrix";

const mascotThemes = ["dolphin-bay", "turtle-trails", "polar-splash", "coastal-explorer", "ocean-quest"];

test("alle 30 onderdelen blijven semantisch bereikbaar en current staat los van selected", async ({ page }) => {
  await page.goto("/test-harness/journey?theme=ocean-quest&count=30");
  const journey = page.locator(".child-journey-map");
  await expect(journey).toHaveAttribute("data-entry-count", "34");
  await expect(page.locator('[data-child-journey-entry^="doel-"]')).toHaveCount(30);
  await expect(page.locator('[data-cluster-size="2"]')).toHaveCount(2);
  await expect(page.locator('[aria-current="step"]')).toHaveCount(1);
  await expect(page.locator('[aria-current="step"]')).toHaveAttribute("data-child-journey-entry", "doel-3");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator('[data-child-journey-entry="doel-2"]').click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator('[aria-current="step"]')).toHaveAttribute("data-child-journey-entry", "doel-3");
  await expect(page.locator('[data-child-journey-entry="doel-2"]')).toHaveAttribute("aria-pressed", "true");
});

test("mouse drag, WheelEvent-proxy en keyboard bedienen de volledige route zonder drag-click", async ({ page }) => {
  await page.goto("/test-harness/journey?theme=ocean-quest&count=30");
  await dismissHelp(page);
  const map = page.locator(".child-journey-map");
  const box = await map.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width * .6, box!.y + box!.height * .55);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * .2, box!.y + box!.height * .55, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const afterDrag = await selectedId(page);
  expect(afterDrag).not.toBe("doel-3");
  await map.hover({ position: { x: box!.width / 2, y: box!.height / 2 } });
  await page.mouse.wheel(120, 0);
  await expect.poll(() => selectedId(page)).not.toBe(afterDrag);
  const selected = page.locator('[data-child-journey-entry][aria-pressed="true"]');
  await selected.focus();
  await selected.press("End");
  await expect(page.locator('[data-child-journey-entry="doel-30"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator('[data-child-journey-entry="doel-30"]')).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.locator('[data-child-journey-entry="event:badge-voor"]')).toBeFocused();
});

test("touch axis-lock laat verticale scroll/jitter vrij en verwerkt een horizontale swipe", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "journey-chromium", "Trusted Android-style touchinput wordt via Chromium CDP gevalideerd.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/test-harness/journey?theme=ocean-quest&count=12");
  await dismissHelp(page);
  const map = page.locator(".child-journey-map");
  const before = await selectedId(page);
  await dispatchTouch(page, [{ x: 220, y: 400 }, { x: 212, y: 408 }, { x: 210, y: 412 }]);
  expect(await selectedId(page)).toBe(before);
  await dispatchTouch(page, [{ x: 250, y: 500 }, { x: 246, y: 420 }, { x: 240, y: 300 }]);
  expect(await selectedId(page)).toBe(before);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await dispatchTouch(page, [{ x: 280, y: 410 }, { x: 220, y: 414 }, { x: 120, y: 416 }]);
  await expect.poll(() => selectedId(page)).not.toBe(before);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("tooltip is eenmalig, niet-modale hulp en popupdeeplinks zijn child-safe", async ({ page }) => {
  await page.goto("/test-harness/journey?theme=ocean-quest&count=7");
  const help = page.getByRole("status").filter({ hasText: "Sleep, veeg" });
  await expect(help).toBeVisible();
  await help.getByRole("button", { name: "Uitleg sluiten" }).click();
  const revisit = await page.context().newPage();
  await revisit.goto(page.url(), { waitUntil: "domcontentloaded" });
  await page.close();
  await expect(revisit.getByRole("status").filter({ hasText: "Sleep, veeg" })).toHaveCount(0);
  await revisit.locator('[data-child-journey-entry="event:surprise-tussen"]').click();
  const dialog = revisit.getByRole("dialog");
  await expect(dialog).toContainText("Verrassingsbadge verdiend");
  await expect(dialog.getByRole("link", { name: "Vier dit moment" })).toHaveAttribute("href", "/kind/badges?badge=surprise-tussen&vier=1");
  await expect(dialog.locator('a[href^="/portaal"]')).toHaveCount(0);
});

test("popupinhoud dekt huidig, voltooid, gewone badge en surprisebadge en herstelt focus", async ({ page }) => {
  await page.goto("/test-harness/journey?theme=ocean-quest&count=7");
  await dismissHelp(page);
  const cases = [
    { id: "doel-3", heading: "Doel 3", copy: "Mijn huidige doel", href: "/kind/reis?onderdeel=doel-3" },
    { id: "doel-1", heading: "Doel 1", copy: "Voltooide stap", href: "/kind/reis?onderdeel=doel-1" },
    { id: "event:badge-tussen", heading: "Watermaatje", copy: "Badge verdiend", href: "/kind/badges?badge=badge-tussen&vier=1" },
    { id: "event:surprise-tussen", heading: "Dappere ontdekker", copy: "Verrassingsbadge verdiend", href: "/kind/badges?badge=surprise-tussen&vier=1" }
  ];
  for (const popupCase of cases) {
    const marker = page.locator(`[data-child-journey-entry="${popupCase.id}"]`);
    await marker.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(popupCase.copy);
    await expect(dialog.getByRole("heading", { name: popupCase.heading })).toBeVisible();
    await expect(dialog.getByRole("link")).toHaveAttribute("href", popupCase.href);
    await page.keyboard.press("Escape");
    await expect(marker).toBeFocused();
  }
});

test("live event-insertie behoudt selectie en geopende popup", async ({ page }) => {
  await page.goto("/test-harness/journey?theme=ocean-quest&count=7");
  await dismissHelp(page);
  const marker = page.locator('[data-child-journey-entry="doel-6"]');
  await marker.evaluate((element: HTMLButtonElement) => element.click());
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Doel 6" })).toBeVisible();
  const beforeCount = Number(await page.locator(".child-journey-map").getAttribute("data-entry-count"));
  await page.evaluate(() => window.dispatchEvent(new Event("journey-test-live-event")));
  await expect(page.locator(".child-journey-map")).toHaveAttribute("data-entry-count", String(beforeCount + 1));
  await expect(marker).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Doel 6" })).toBeVisible();
  await expect(page.locator('[data-child-journey-entry="event:badge-live"]')).toHaveCount(1);
});

test("tooltip en journey blijven werken wanneer storage geblokkeerd is", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException("blocked", "SecurityError"); };
    Storage.prototype.setItem = () => { throw new DOMException("blocked", "SecurityError"); };
  });
  await page.goto("/test-harness/journey?theme=ocean-quest&count=7");
  const help = page.getByRole("status").filter({ hasText: "Sleep, veeg" });
  await expect(help).toBeVisible();
  await help.getByRole("button", { name: "Uitleg sluiten" }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("journey-test-live-event")));
  await expect(page.locator('[data-child-journey-entry="event:badge-live"]')).toHaveCount(1);
  await expect(help).toHaveCount(0);
  await page.locator('[data-child-journey-entry="doel-3"]').focus();
  await page.keyboard.press("End");
  await expect(page.locator('[data-child-journey-entry="doel-7"]')).toBeFocused();
});

test("dezelfde childcontext krijgt na een themeswitch geen tweede tooltip", async ({ page }) => {
  await page.goto("/test-harness/journey?theme=ocean-quest&count=7");
  const help = page.getByRole("status").filter({ hasText: "Sleep, veeg" });
  await expect(help).toBeVisible();
  await help.getByRole("button", { name: "Uitleg sluiten" }).click();
  await page.goto("/test-harness/journey?theme=dolphin-bay&count=7");
  await expect(help).toHaveCount(0);
  await expect(page.locator('[aria-current="step"]')).toHaveAttribute("data-child-journey-entry", "doel-3");
});

test("lege, onbeoordeelde, volledig voltooide en scenery-loze states falen veilig", async ({ page }) => {
  await page.goto("/test-harness/journey?theme=ocean-quest&count=0");
  await expect(page.locator("[data-child-journey-entry]")).toHaveCount(0);
  await expect(page.locator('[aria-current="step"]')).toHaveCount(0);
  await expect(page.locator(".child-journey-map__mascot")).toHaveCount(0);
  await expect(page.getByText("Je reis wordt zichtbaar")).toBeVisible();

  await page.goto("/test-harness/journey?theme=ocean-quest&count=4&assessments=none");
  await expect(page.locator('[aria-current="step"]')).toHaveAttribute("data-child-journey-entry", "doel-1");
  await expect(page.locator('[data-child-journey-entry="doel-1"]')).toHaveAttribute("aria-label", /nog niet beoordeeld/);

  await page.goto("/test-harness/journey?theme=ocean-quest&count=4&complete=all");
  await expect(page.locator('[data-child-journey-entry^="doel-"]')).toHaveCount(4);
  await expect(page.locator('[aria-current="step"]')).toHaveCount(0);
  await expect(page.locator(".child-journey-map__mascot")).toHaveCount(0);

  await page.goto("/test-harness/journey?theme=ocean-quest&count=7&scenery=none");
  await expect(page.locator('[data-child-journey-entry^="doel-"]')).toHaveCount(7);
  await expect(page.locator('[aria-current="step"]')).toHaveCount(1);
});

test("axe, 48px hitboxes, reduced motion en no-mascot recipes blijven groen", async ({ page }) => {
  await page.goto("/test-harness/journey?theme=ocean-quest&count=12");
  await dismissHelp(page);
  const undersized = await page.locator("[data-child-journey-entry]").evaluateAll((entries) => entries.filter((entry) => {
    const box = entry.getBoundingClientRect();
    return box.width < 48 || box.height < 48;
  }).length);
  expect(undersized).toBe(0);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? ""))).toEqual([]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator('[data-child-journey-entry="doel-2"]').click();
  await expect(page.locator(".child-journey-map")).toHaveAttribute("data-motion-settled", "true");
  for (const theme of ["nxttrack-default", "nationaal-zwem-abc"]) {
    await page.goto(`/test-harness/journey?theme=${theme}&count=7`);
    await expect(page.locator(".child-journey-map__mascot")).toHaveCount(0);
  }
});

test("630 echte DOM-collision-eindstates hebben minimaal 12px vrije ruimte", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "journey-chromium", "De geometrische browsertest draait eenmaal in Chromium; kerninteractie draait in alle drie engines.");
  test.setTimeout(300_000);
  // Endpoint geometry is independent from animation duration. Swept paths are
  // covered separately; reduced motion keeps this 630-state matrix bounded.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const matrixThemes = process.env.JOURNEY_MATRIX_THEME ? mascotThemes.filter((theme) => theme === process.env.JOURNEY_MATRIX_THEME) : mascotThemes;
  const matrixViewports = process.env.JOURNEY_MATRIX_VIEWPORT
    ? PORTAL_REQUIRED_VIEWPORTS.filter((viewport) => viewport.name === process.env.JOURNEY_MATRIX_VIEWPORT)
    : PORTAL_REQUIRED_VIEWPORTS;
  let cases = 0;
  for (const theme of matrixThemes) {
    for (const viewport of matrixViewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`/test-harness/journey?theme=${theme}&count=12`);
      await expect(page.locator(".child-journey-map"), `${theme}/${viewport.name}/initial`).toHaveAttribute("data-motion-settled", "true");
      await dismissHelp(page);
      const entries = page.locator("[data-child-journey-entry]");
      const count = await entries.count();
      const indices = [0, Math.floor(count / 2), count - 1, 2];
      for (const index of indices) {
        for (const popupOpen of [false, true]) {
          const caseLabel = `${theme}/${viewport.name}/entry-${index}/${popupOpen ? "popup" : "focus"}`;
          const marker = entries.nth(index);
          if (popupOpen) await marker.evaluate((element: HTMLButtonElement) => element.click());
          else await marker.evaluate((element: HTMLButtonElement) => element.focus({ preventScroll: true }));
          const selectedEntryId = await marker.getAttribute("data-child-journey-entry");
          await expect(marker, caseLabel).toHaveAttribute("aria-pressed", "true");
          if (popupOpen) await expect(page.getByRole("dialog"), caseLabel).toBeVisible();
          await expect(page.locator(".child-journey-map"), caseLabel).toHaveAttribute("data-mascot-entry", selectedEntryId!);
          await expect(page.locator(".child-journey-map"), caseLabel).toHaveAttribute("data-motion-settled", "true");
          await assertMascotClearance(page, 12, caseLabel);
          if (popupOpen) {
            await page.keyboard.press("Escape");
            await expect(marker, `${caseLabel}/focus-return`).toBeFocused();
          }
          cases += 1;
        }
      }
      await page.evaluate(() => localStorage.removeItem("nxttrack:help:journey-direct-manipulation-v1"));
      await page.reload();
      await expect(page.getByRole("status").filter({ hasText: "Sleep, veeg" })).toBeVisible();
      await expect(page.locator(".child-journey-map"), `${theme}/${viewport.name}/tooltip-settled`).toHaveAttribute("data-motion-settled", "true");
      await assertMascotClearance(page, 12, `${theme}/${viewport.name}/tooltip`);
      cases += 1;
    }
  }
  expect(cases).toBe(matrixThemes.length * matrixViewports.length * 9);
});

async function selectedId(page: Page) {
  return page.locator('[data-child-journey-entry][aria-pressed="true"]').getAttribute("data-child-journey-entry");
}

async function dismissHelp(page: Page) {
  const button = page.getByRole("button", { name: "Uitleg sluiten" });
  if (await button.waitFor({ state: "visible", timeout: 1_200 }).then(() => true).catch(() => false)) await button.click();
}

async function dispatchTouch(page: Page, points: Array<{ x: number; y: number }>) {
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [points[0]!] });
  for (const point of points.slice(1)) {
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await session.detach();
}

async function assertMascotClearance(page: Page, clearance: number, caseLabel: string) {
  const result = await page.evaluate((clearance) => {
    const mascot = document.querySelector<HTMLElement>(".child-journey-map__mascot");
    const map = document.querySelector<HTMLElement>(".child-journey-map");
    if (!mascot || !map) return { error: "mascot_missing" };
    const mascotBox = mascot.getBoundingClientRect();
    const mapBox = map.getBoundingClientRect();
    const selected = map.querySelector<HTMLElement>('[aria-pressed="true"]');
    const selectedBox = selected?.getBoundingClientRect();
    const popup = map.querySelector<HTMLElement>(".child-journey-map__popup");
    const popupBox = popup?.getBoundingClientRect();
    const exclusions = [
      ...map.querySelectorAll<HTMLElement>("[data-child-journey-entry], .child-journey-map__popup, .child-journey-map__help"),
      ...(map.parentElement?.querySelectorAll<HTMLElement>("[data-journey-exclusion]") ?? [])
    ]
      .filter((element) => element !== mascot && getComputedStyle(element).visibility !== "hidden")
      .map((element) => element.getBoundingClientRect())
      .filter((box) => box.width > 0 && box.height > 0);
    const overlaps = exclusions.filter((box) => mascotBox.left < box.right + clearance
      && mascotBox.right + clearance > box.left
      && mascotBox.top < box.bottom + clearance
      && mascotBox.bottom + clearance > box.top).length;
    const visibleLabels = [...map.querySelectorAll<HTMLElement>("[data-child-journey-entry] strong")]
      .map((element) => element.getBoundingClientRect())
      .filter((box) => box.right > mapBox.left && box.left < mapBox.right && box.bottom > mapBox.top && box.top < mapBox.bottom);
    let labelOverlaps = 0;
    visibleLabels.forEach((left, index) => visibleLabels.slice(index + 1).forEach((right) => {
      if (left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top) labelOverlaps += 1;
    }));
    return {
      inside: mascotBox.left >= mapBox.left + clearance && mascotBox.right <= mapBox.right - clearance && mascotBox.top >= mapBox.top + clearance && mascotBox.bottom <= mapBox.bottom - clearance,
      labelOverlaps,
      map: { bottom: mapBox.bottom, left: mapBox.left, right: mapBox.right, scrollLeft: map.scrollLeft, scrollTop: map.scrollTop, top: mapBox.top },
      mascot: { bottom: mascotBox.bottom, left: mascotBox.left, right: mascotBox.right, top: mascotBox.top },
      mascotParents: { offset: (mascot.offsetParent as HTMLElement | null)?.className, parent: mascot.parentElement?.className },
      mascotStyle: { left: mascot.style.left, top: mascot.style.top, transform: getComputedStyle(mascot).transform },
      overlaps,
      popupInside: !popupBox || (popupBox.left >= mapBox.left && popupBox.right <= mapBox.right && popupBox.top >= mapBox.top && popupBox.bottom <= mapBox.bottom),
      popupOverlapsSelected: Boolean(popupBox && selectedBox && popupBox.left < selectedBox.right && popupBox.right > selectedBox.left && popupBox.top < selectedBox.bottom && popupBox.bottom > selectedBox.top),
      selected: selectedBox ? { id: selected?.dataset.childJourneyEntry, left: selectedBox.left, top: selectedBox.top } : null,
      selectedInside: Boolean(selectedBox && selectedBox.left >= mapBox.left && selectedBox.right <= mapBox.right && selectedBox.top >= mapBox.top && selectedBox.bottom <= mapBox.bottom)
    };
  }, clearance);
  expect("error" in result ? result.error : result.inside, `${caseLabel}: ${JSON.stringify(result)}`).toBe(true);
  if (!("error" in result)) {
    expect(result.overlaps, `${caseLabel}: ${JSON.stringify(result)}`).toBe(0);
    expect(result.selectedInside, `${caseLabel}: ${JSON.stringify(result)}`).toBe(true);
    expect(result.popupInside, `${caseLabel}: ${JSON.stringify(result)}`).toBe(true);
    expect(result.popupOverlapsSelected, `${caseLabel}: ${JSON.stringify(result)}`).toBe(false);
    expect(result.labelOverlaps, `${caseLabel}: ${JSON.stringify(result)}`).toBe(0);
  }
}
