import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { diagnoseCommunicationLogin } from "../../../../scripts/release/communication-login-diagnostic";

const email = "synthetic-private@example.test";
const password = "synthetic-password-never-report";
const token = "synthetic-cookie-never-report";
const nextPath = "/platform/badges";

for (const scenario of ["normal", "late-post", "missing-post", "explicit-error"] as const) {
  test(`diagnostic ${scenario}: preserves assertion, observes only, emits safe metadata`, async ({ page }) => {
    test.setTimeout(35_000);
    let posts = 0;
    let protectedRequests = 0;
    const outputDirectory = mkdtempSync(path.join(tmpdir(), "communication-diagnostic-contract-"));
    const server = createServer(async (request, response) => {
      if (request.method === "POST") {
        posts += 1;
        if (scenario === "late-post") await new Promise((resolve) => setTimeout(resolve, 6_500));
        response.writeHead(200, { "set-cookie": `sb-local-auth-token=${token}; Path=/; HttpOnly` });
        return response.end("complete");
      }
      if (request.url?.startsWith("/login")) {
        response.writeHead(200, { "content-type": "text/html" });
        return response.end(`<link rel="icon" href="data:,"><form><input name="email"><input name="password" type="password"><button>Inloggen</button></form><script>
          document.querySelector('form').onsubmit = async event => {
            event.preventDefault();
            ${scenario === "missing-post" ? "return;" : ""}
            await fetch(location.href, {method:'POST'});
            location.href = ${JSON.stringify(scenario === "explicit-error" ? `/login?error=${token}` : nextPath)};
          };
        </script>`);
      }
      protectedRequests += 1;
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<link rel='icon' href='data:,'><h1>Protected fixture</h1>");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Local fixture did not bind");
    const baseURL = `http://127.0.0.1:${address.port}`;
    let originalError: unknown;
    let caughtError: unknown;
    try {
      try {
        await diagnoseCommunicationLogin(page, nextPath, async (diagnostic) => {
          await page.goto(`${baseURL}/login`, { waitUntil: "domcontentloaded" });
          await page.locator("input[name='email']").fill(email);
          await page.locator("input[name='password']").fill(password);
          await diagnostic.beforeClick(email, password);
          await page.getByRole("button", { name: /inloggen/i }).click();
          await page.waitForLoadState("domcontentloaded");
          await diagnostic.originalAssertion(async () => {
            try { await expect(page).toHaveURL(new RegExp(`${nextPath.replaceAll("/", "\\/")}(?:\\?|$)`), { timeout: 5_000 }); }
            catch (error) { originalError = error; throw error; }
          });
        }, { baseURL, outputDirectory });
      } catch (error) { caughtError = error; }
      const raw = readFileSync(path.join(outputDirectory, "login-owner.json"), "utf8");
      const report = JSON.parse(raw);
      for (const forbidden of [email, password, token, baseURL, nextPath, "set-cookie"]) expect(raw).not.toContain(forbidden);
      expect(report.events.find((event: { event: string }) => event.event === "before-click").fieldsPresent).toBe(true);
      expect(posts).toBe(scenario === "missing-post" ? 0 : 1);
      if (scenario === "normal") {
        expect(caughtError).toBeUndefined();
        expect(report.assertionStatus).toBe("passed");
        expect(report.observationElapsedMs).toBe(0);
      } else {
        expect(originalError).toBeDefined();
        expect(caughtError).toBe(originalError);
        expect(report.assertionStatus).toBe("failed");
        expect(report.originalFailed).toBe(true);
        expect(report.lateExpectedNavigation).toBe(scenario === "late-post");
        expect(report.observationElapsedMs).toBeLessThan(16_000);
        if (scenario !== "late-post") expect(report.observationElapsedMs).toBeGreaterThanOrEqual(14_900);
      }
      expect(report.authCookiePresentHeuristic).toBe(scenario !== "missing-post");
      expect(report.finalLocation.explicitError).toBe(scenario === "explicit-error");
      expect(protectedRequests).toBe(["normal", "late-post"].includes(scenario) ? 1 : 0);
      const postEvents = report.events.filter((event: { event: string; method?: string }) => event.event === "request" && event.method === "POST");
      expect(postEvents).toHaveLength(posts);
      if (scenario === "late-post") {
        const response = report.events.find((event: { event: string; method?: string }) => event.event === "response" && event.method === "POST");
        expect(response.status).toBe(200);
        expect(response.requestElapsedMs).toBeGreaterThanOrEqual(6_400);
      }
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(outputDirectory, { recursive: true, force: true });
    }
  });
}
