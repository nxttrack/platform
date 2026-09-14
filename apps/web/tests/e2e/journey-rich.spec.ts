import { expect, test, type Page } from "@playwright/test";

const geometryErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = []; geometryErrors.set(page, errors);
  page.on("console", (message) => { if (/Infinity|NaN/.test(message.text())) errors.push(message.text()); });
});
test.afterEach(({ page }) => { expect(geometryErrors.get(page)).toEqual([]); });

test("rich scene keeps every node reachable with a closed initial detail and neutral pearls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const count of [0, 1, 4, 5, 7, 12, 24, 48]) {
    await page.goto(`/test-harness/journey-rich?count=${count}`);
    const scene = page.locator("[data-rich-journey]");
    await expect(scene).toHaveAttribute("data-node-count", String(count));
    await expect(page.getByRole("complementary", { name: "Onderdeel bekijken" })).toHaveCount(0);
    await expect(scene.locator("[data-rich-node] img")).toHaveCount(0);
    await scene.getByRole("button", { name: `Alle ${count} onderdelen`, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Alle onderdelen" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("li")).toHaveCount(count);
    if (count) {
      await dialog.locator("li").last().getByRole("button").click();
      await expect(page.getByRole("complementary", { name: "Onderdeel bekijken" })).toBeVisible();
      await expect(scene.locator(`[data-rich-node="fixture-${count}"]`)).toHaveAttribute("data-selected", "true");
      await page.getByRole("button", { name: "Detailkaart sluiten" }).click();
    } else await dialog.getByRole("button", { name: "Venster sluiten" }).click();
  }
});

test("rich scene separates orientation, maintains camera on refresh and suppresses clicks after drag", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/test-harness/journey-rich?count=7");
  const scene = page.locator("[data-rich-journey]");
  await expect(scene).toHaveAttribute("data-orientation", "landscape");
  await expect(scene.locator("[data-rich-world]")).not.toHaveCSS("transform", "none");
  await scene.getByRole("button", { name: "Alle 7 onderdelen", exact: true }).click();
  await page.getByRole("dialog").locator("li").nth(3).getByRole("button").click();
  await page.getByRole("button", { name: "Detailkaart sluiten" }).click();
  const world = scene.locator("[data-rich-world]");
  const before = await world.evaluate((element) => getComputedStyle(element).transform);
  const box = await scene.boundingBox(); if (!box) throw new Error("Scene bounds missing");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 50, { steps: 8 }); await page.mouse.up();
  await expect(page.getByRole("complementary", { name: "Onderdeel bekijken" })).toHaveCount(0);
  await expect.poll(() => world.evaluate((element) => getComputedStyle(element).transform)).not.toBe(before);
  const moved = await world.evaluate((element) => getComputedStyle(element).transform);
  // Same route navigation refreshes the server props without replacing the client context.
  await page.getByRole("button", { name: "Fixture opnieuw laden" }).click();
  await expect(world).toHaveCSS("transform", moved);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(scene).toHaveAttribute("data-orientation", "portrait");
  await expect(scene.locator('[data-rich-node="fixture-4"]')).toHaveAttribute("data-selected", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(scene).toHaveAttribute("data-reduced-motion", "true");
});

test("rich Default fixture has all six distinct world identities and a readable compact progress pod", async ({ page }, testInfo) => {
  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 412, height: 915 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/test-harness/journey-rich?world=badje-a&count=12");
    const scene = page.locator("[data-rich-journey]");
    const pod = page.getByLabel("Voortgang en dekking", { exact: true });
    const bounds = await scene.boundingBox(), podBounds = await pod.boundingBox();
    expect(bounds).not.toBeNull(); expect(podBounds).not.toBeNull();
    expect(podBounds!.width).toBeLessThanOrEqual(bounds!.width / 2);
    await expect(pod).toHaveCSS("background-color", "rgba(255, 255, 255, 0.4)");
    await expect(scene.getByRole("link", { name: /Volgende les:/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const label = scene.locator('[data-rich-node][data-selected="true"]').locator('..').locator('[data-rich-label]');
    await expect(label).toBeVisible();
    expect((await label.boundingBox())!.height).toBeGreaterThan(20);
    await page.screenshot({ path: testInfo.outputPath(`fixture-${viewport.width}x${viewport.height}.png`) });
  }
  for (const world of ["badje-01", "badje-02", "badje-03", "badje-a", "badje-b", "badje-c"]) {
    await page.goto(`/test-harness/journey-rich?world=${world}`);
    await expect(page.locator("[data-rich-journey]")).toHaveAttribute("data-world-id", world);
    await expect(page.getByText("Testweergave · originele wereldbeelden en ankers ontbreken")).toBeVisible();
  }
});


test("selection leaves the canonical current goal intact and keyboard navigation reaches every segment", async ({ page }) => {
  await page.goto("/test-harness/journey-rich?count=48");
  const scene = page.locator("[data-rich-journey]");
  await expect(scene.locator('[data-rich-node="fixture-3"]')).toHaveAttribute("aria-current", "step");
  await scene.focus(); await page.keyboard.press("End");
  await expect(scene.locator('[data-rich-node="fixture-48"]')).toHaveAttribute("data-selected", "true");
  await expect(scene.locator('[data-rich-node="fixture-48"]')).not.toHaveAttribute("aria-current", "step");
  await page.keyboard.press("Home");
  await expect(scene.locator('[data-rich-node="fixture-1"]')).toHaveAttribute("data-selected", "true");
  await expect(scene.locator('[data-rich-node="fixture-3"]')).toHaveAttribute("aria-current", "step");
  await expect(page.getByRole("complementary", { name: "Onderdeel bekijken" })).toHaveCount(0);
});


test("badge moments remain separate from curriculum nodes, with a complete keyboard-accessible history", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await page.goto("/test-harness/journey-rich?count=7&moments=1");
  const scene = page.locator("[data-rich-journey]"); await expect(scene).toHaveAttribute("data-node-count", "7");
  const goal = scene.locator('[data-rich-node="fixture-3"]'); await expect(goal).toHaveAttribute("aria-current", "step");
  const trigger = page.getByRole("button", { name: "Alle 3 momenten", exact: true }); await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Bijzondere momenten" }); await expect(dialog.locator("[data-journey-event]")).toHaveCount(3);
  await expect(dialog.getByText("Verrassingsbadge", { exact: true })).toBeVisible();
  await expect(dialog.getByText("1 augustus 2026", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape"); await expect(trigger).toBeFocused(); await expect(goal).toHaveAttribute("aria-current", "step");
  await page.setViewportSize({ width: 390, height: 844 }); await trigger.click(); await expect(dialog.locator("[data-journey-event]")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await page.goto("/test-harness/journey-rich?count=0&moments=1"); await page.getByRole("button", { name: "Alle 3 momenten", exact: true }).click();
  await expect(page.getByRole("dialog").locator("[data-journey-event]")).toHaveCount(3);
});

test("visible pearls remain registered to the rendered smooth route in both orientations", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport); await page.goto("/test-harness/journey-rich?count=12");
    const error = await page.locator("[data-rich-world]").evaluate((world) => {
      const path = world.querySelector("svg path") as SVGPathElement;
      const width = parseFloat((world as HTMLElement).style.width), height = parseFloat((world as HTMLElement).style.height);
      const length = path.getTotalLength(); const samples = Array.from({ length: 5001 }, (_, index) => path.getPointAtLength(length * index / 5000));
      return Math.max(...[...world.querySelectorAll("[data-rich-node]")].map((node) => {
        const marker = node.parentElement!; const x = parseFloat(marker.style.left) / 100 * width, y = parseFloat(marker.style.top) / 100 * height;
        return Math.min(...samples.map((sample) => Math.hypot(sample.x - x, sample.y - y)));
      }));
    });
    expect(error).toBeLessThan(1);
  }
});

test("guide parks clear of controls, does not measure obstacles during drag and stops when offscreen or motion is reduced",async({page})=>{
  await page.setViewportSize({width:1440,height:900});await page.goto('/test-harness/journey-rich?count=7');
  const scene=page.locator('[data-rich-journey]'),guide=scene.locator('[data-rich-guide]');
  await expect(guide).toBeVisible();
  await expect.poll(()=>guide.evaluate(element=>{
    const box=element.getBoundingClientRect(),parent=element.closest('[data-rich-journey]')!,bounds=parent.getBoundingClientRect();
    return box.left>=bounds.left && box.right<=bounds.right && box.top>=bounds.top && box.bottom<=bounds.bottom && [...parent.querySelectorAll('[data-rich-obstacle]')].every(obstacle=>{
      const other=obstacle.getBoundingClientRect();return box.right<=other.left || box.left>=other.right || box.bottom<=other.top || box.top>=other.bottom;
    });
  })).toBe(true);
  await scene.evaluate(()=>{
    const original=Element.prototype.getBoundingClientRect;
    const state=window as typeof window & {journeyObstacleReads:number;restoreJourneyMeasurements:()=>void};
    state.journeyObstacleReads=0;state.restoreJourneyMeasurements=()=>{Element.prototype.getBoundingClientRect=original;};
    Element.prototype.getBoundingClientRect=function(){if(this.matches('[data-rich-obstacle]')) state.journeyObstacleReads+=1;return original.call(this);};
  });
  const box=(await scene.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+60,box.y+box.height/2+20,{steps:15});
  await expect(guide).toHaveCount(0);
  expect(await scene.evaluate(()=>(window as typeof window & {journeyObstacleReads:number}).journeyObstacleReads)).toBe(0);
  await scene.evaluate(()=>(window as typeof window & {restoreJourneyMeasurements:()=>void}).restoreJourneyMeasurements());
  await page.mouse.up();await expect(guide).toBeVisible();
  await scene.evaluate(element=>{(element as HTMLElement).style.marginTop='200vh';});
  await expect(guide).toHaveCount(0);
  await scene.evaluate(element=>{(element as HTMLElement).style.marginTop='';});await expect(guide).toBeVisible();
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(scene).toHaveAttribute('data-reduced-motion','true');
  await expect(guide.locator('[data-pulse]')).toHaveAttribute('data-pulse','false');
  expect(await guide.evaluate(element=>element.getAnimations({subtree:true}).filter(animation=>animation.playState==='running').length)).toBe(0);
  await scene.getByRole('button',{name:'Gids tonen'}).click();await expect(guide).toHaveCount(0);
  await scene.getByRole('button',{name:'Alle 7 onderdelen',exact:true}).click();await expect(page.getByRole('dialog').locator('li')).toHaveCount(7);
});
