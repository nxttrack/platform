import { expect, test } from "@playwright/test";

test("maintenance preview is readable, healthy and rejects unsafe requests", async ({ page, request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  const healthBody = await health.json();
  expect(healthBody).toMatchObject({ app: "nxttrack-platform", ok: true });

  const login = await page.goto("/login", { waitUntil: "domcontentloaded" });
  expect(login).not.toBeNull();
  expect(login!.status()).toBeLessThan(500);
  await expect(page.locator("body")).not.toBeEmpty();

  const denied = await request.post("/api/internal/email-outbox/process", { data: {} });
  if (process.env.MAINTENANCE_NO_WRITE === "true") {
    expect(denied.status()).toBe(503);
    expect((await denied.json()).error).toBe("maintenance_no_write");
  } else {
    expect(denied.status()).toBe(401);
  }
});
