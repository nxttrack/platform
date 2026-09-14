import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
test.use({ actionTimeout: 15_000 });

async function login(page: Page, email: string, password: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Wachtwoord", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Inloggen", exact: true }).click();
}

test("real family collection needs explicit save, survives network retry/reload and shares immutable discoveries with child mode", async ({ page, browser, baseURL }, info) => {
  const file = process.env.PORTAL_COLLECTION_BROWSER_FIXTURE;
  test.skip(!file, "Requires an explicitly seeded fictional collection/family in a local database");
  if (!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) throw new Error("Collection browser writes require a loopback application");
  const f = JSON.parse(readFileSync(file!, "utf8"));
  const childContext = await browser.newContext(), child = await childContext.newPage();
  const home = `/portaal?kind=${f.child}`;
  try {
    await login(page, f.email, f.password, home);
    const collection = page.getByRole("dialog", { name: "Mijn verzameling", exact: true });
    const discovery = page.getByRole("dialog", { name: "Een kleine ontdekking", exact: true });
    const openCollection = page.getByRole("button", { name: "Mijn verzameling", exact: true });
    const discover = page.getByRole("button", { name: "Ontdek een vrije vondst", exact: true });
    await expect(openCollection).toBeVisible({ timeout: 45_000 });
    await openCollection.click(); await expect(collection).toContainText("Je verzameling is nog leeg");
    await page.keyboard.press("Escape"); await expect(openCollection).toBeFocused();
    await discover.click(); await expect(discovery.getByRole("heading", { level: 3 })).toContainText(/Fictieve (schelp|steen)/);
    const title = (await discovery.getByRole("heading", { level: 3 }).textContent())!;
    // Discovery alone never owns a collectible.
    await discovery.getByRole("button", { name: "Verder ontdekken" }).click();
    await openCollection.click(); await expect(collection).toContainText("0 bewaarde vondsten"); await page.keyboard.press("Escape");
    await discover.click();
    const secondTitle = (await discovery.getByRole("heading", { level: 3 }).textContent())!;
    expect(secondTitle).not.toEqual(title);
    await page.route("**/portaal?**", route => route.request().method() === "POST" ? route.abort("failed") : route.continue());
    await discovery.getByRole("button", { name: "Bewaar in mijn verzameling", exact: true }).click();
    await expect(discovery.getByRole("alert")).toContainText("verbinding");
    await expect(discovery.getByRole("heading", { level: 3 })).toHaveText(secondTitle);
    await page.unroute("**/portaal?**");
    await discovery.getByRole("button", { name: "Bewaar in mijn verzameling", exact: true }).click();
    await expect(discovery.getByRole("button", { name: "Bewaard in je verzameling", exact: true })).toBeDisabled();
    await page.reload(); await openCollection.click();
    await expect(collection).toContainText("1 bewaarde vondst");
    const saved = collection.getByRole("button", { name: new RegExp(secondTitle) });
    const originalAsset = await saved.locator("img").getAttribute("src");
    await saved.click();
    const detail = page.getByRole("dialog", { name: secondTitle, exact: true });
    await expect(detail).toContainText("oorspronkelijke afbeelding en titel");
    await expect(detail.locator("img")).toHaveAttribute("src", originalAsset!);
    await page.keyboard.press("Escape"); await expect(saved).toBeFocused();
    await collection.getByRole("searchbox").fill("niet-bestaande-vondst"); await expect(collection).toContainText("Geen vondst met deze naam");
    await page.keyboard.press("Escape");
    await login(child, f.email, f.password, "/portaal/kinderen");
    await child.locator("article").filter({ hasText: "Fictieve Lotte" }).getByRole("button", { name: /^Open kindmodus/ }).click();
    await expect(child).toHaveURL(/\/kind$/);
    await child.getByRole("button", { name: "Mijn verzameling", exact: true }).click();
    const childList = child.getByRole("dialog", { name: "Mijn verzameling", exact: true });
    await expect(childList).toContainText("1 bewaarde vondst"); await expect(childList).toContainText(secondTitle);
    await expect(childList.getByRole("button", { name: new RegExp(secondTitle) }).locator("img")).toHaveAttribute("src", originalAsset!);
    await page.screenshot({ path: info.outputPath("parent-collection.png") });
    await child.keyboard.press("Escape");
    await child.getByRole("button", { name: "Ontdek een vrije vondst", exact: true }).click();
    const childDiscovery = child.getByRole("dialog", { name: "Een kleine ontdekking", exact: true });
    await expect(childDiscovery.getByRole("heading", { level: 3 })).toHaveText(title);
    await childDiscovery.getByRole("button", { name: "Bewaar in mijn verzameling", exact: true }).click();
    await expect(childDiscovery.getByRole("button", { name: "Bewaard in je verzameling", exact: true })).toBeDisabled();
    await child.keyboard.press("Escape");
    await page.reload(); await openCollection.click(); await expect(collection).toContainText("2 bewaarde vondsten"); await page.keyboard.press("Escape");
    await discover.click(); await discovery.getByRole("button", { name: "Bewaar in mijn verzameling", exact: true }).click();
    await expect(discovery.getByRole("button", { name: "Al in je verzameling", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await page.goto(`/portaal?kind=${f.otherChild}`); await expect(openCollection).toHaveCount(0);
    for (const [width,height] of [[320,740],[390,844],[768,1024],[1024,768],[1440,900]]) {
      await child.setViewportSize({ width,height });
      await expect(child.getByRole("button", { name: "Mijn verzameling", exact: true })).toBeVisible();
      await expect.poll(() => child.locator('[aria-label="Wereld verkennen"]').evaluate(nav => {
        const box=nav.getBoundingClientRect(), scene=nav.closest('[data-rich-journey]')!.getBoundingClientRect();
        const pod=nav.parentElement!.querySelector('[aria-label="Voortgang en dekking"]')?.getBoundingClientRect();
        return box.left>=scene.left && box.right<=scene.right && box.top>=scene.top && box.bottom<=scene.bottom && (!pod || box.left>=pod.right || box.top>=pod.bottom || box.bottom<=pod.top);
      })).toBe(true);
    }
    await child.setViewportSize({ width: 390, height: 844 });
    await child.screenshot({ path: info.outputPath("child-collection-controls-mobile.png") });
  } finally { await childContext.close(); }
});
