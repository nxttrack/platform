import { expect, test } from "@playwright/test";

const measurementId = process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID;

test.describe("privacy-first public analytics", () => {
  test.skip(!measurementId, "Set NEXT_PUBLIC_GOOGLE_ANALYTICS_ID to exercise the consent-aware Google tag.");

  test("blocks Google before consent, remembers refusal and strips lead parameters after consent", async ({ page }) => {
    const googleTagRequests: string[] = [];

    await page.route("https://www.googletagmanager.com/**", async (route) => {
      googleTagRequests.push(route.request().url());
      await route.fulfill({ body: "/* mocked gtag.js */", contentType: "application/javascript", status: 200 });
    });

    await page.goto("/nxttrack?utm_source=ouder@example.nl&utm_campaign=persoonlijk&gclid=raw-click-id", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("dialog", { name: "Cookievoorkeuren" })).toBeVisible();
    expect(googleTagRequests).toEqual([]);

    await page.getByRole("button", { name: "Alleen noodzakelijk" }).click();
    await expect(page.getByRole("button", { name: "Cookievoorkeuren" })).toBeVisible();
    expect(googleTagRequests).toEqual([]);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("dialog", { name: "Cookievoorkeuren" })).toHaveCount(0);
    expect(googleTagRequests).toEqual([]);

    await page.getByRole("button", { name: "Cookievoorkeuren" }).click();
    await page.getByRole("button", { name: "Analytics toestaan" }).click();
    await expect.poll(() => googleTagRequests.length).toBe(1);

    const dataLayer = await page.evaluate(() => window.dataLayer ?? []);
    const serialized = JSON.stringify(dataLayer);

    expect(serialized).toContain("page_view");
    expect(serialized).toContain("acquisition_channel");
    expect(serialized).not.toContain("ouder@example.nl");
    expect(serialized).not.toContain("raw-click-id");
    expect(serialized).not.toContain("utm_campaign");
  });
});
