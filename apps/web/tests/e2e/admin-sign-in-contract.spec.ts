import { createServer, type RequestListener } from "node:http";
import { expect, test as base, type Page } from "@playwright/test";
import { isLoginDestination, signInAdmin } from "./helpers/admin-sign-in";

// Every request is fulfilled locally; no accounts, tokens or Supabase are used.
const baseURL = "http://login-contract.test";
const nextPath = "/admin/programma";
const expected = new URL(nextPath, baseURL);
const heading = "<h1>Programma's en leerlijnen</h1>";
const test = base.extend<{ localServer: Awaited<ReturnType<typeof startServer>> }>({
  localServer: async ({}, use) => {
    const server = await startServer();
    try { await use(server); } finally { await server.close(); }
  }
});
test.describe.configure({ mode: "default" });

for (const [path, accepted] of [
  ["/admin/programma", true],
  ["/admin/programma?saved=1#details", true],
  ["/login?next=%2Fadmin%2Fprogramma", false],
  ["/login?next=/admin/programma", false],
  ["/admin/programma-extra", false],
  ["https://other.example/admin/programma", false]
] as const) {
  test(`destination ${path} is ${accepted ? "accepted" : "rejected"}`, () => {
    expect(isLoginDestination(new URL(path, baseURL), expected)).toBe(accepted);
  });
}

type Scenario = {
  destination?: string;
  status?: number;
  noSubmit?: boolean;
  nativeSubmit?: boolean;
  abort?: boolean;
  missingUI?: boolean;
  loseSession?: boolean;
  pending?: Promise<void>;
  timeout?: number;
};

async function startServer() {
  let handler: RequestListener;
  const server = createServer((request, response) => {
    if (typeof handler === "function") handler(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing local fixture address");
  return {
    baseURL: `http://127.0.0.1:${address.port}`,
    handle: (value: typeof handler) => { handler = value; },
    close: () => new Promise<void>((resolve, reject) => {
      server.closeAllConnections();
      server.close((error) => error ? reject(error) : resolve());
    })
  };
}

async function fixture(page: Page, server: Awaited<ReturnType<typeof startServer>>, scenario: Scenario = {}) {
  let submits = 0;
  let protectedRequests = 0;
  let submitted!: () => void;
  const submission = new Promise<void>((resolve) => { submitted = resolve; });
  if (scenario.abort) {
    await page.route((url) => url.origin === server.baseURL, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      submits += 1;
      submitted();
      await route.abort("failed");
    });
  }
  // Wrong-origin cases are also isolated: never contact an external host.
  await page.route((url) => url.origin !== server.baseURL, (route) =>
    route.fulfill({ contentType: "text/html", body: heading }));
  server.handle(async (request, response) => {
    const url = new URL(request.url!, server.baseURL);
    const respond = (status: number, body: string, headers = {}) => {
      response.writeHead(status, { "content-type": "text/html", ...headers });
      response.end(body);
    };
    if (request.method === "POST") {
      submits += 1;
      submitted();
      await scenario.pending;
      if (scenario.nativeSubmit) {
        return respond(303, "", { location: nextPath });
      }
      return respond(scenario.status ?? 200, "completed");
    }
    if (url.pathname === "/login") {
      return respond(200, `
        <link rel="icon" href="data:,">
        <form method="post">
          <input name="email" type="email" required>
          <input name="password" type="password" required>
          <button type="submit">Inloggen</button>
        </form>
        ${scenario.nativeSubmit ? "" : `<script>
          document.querySelector('form').onsubmit = async (event) => {
            event.preventDefault();
            ${scenario.noSubmit ? "return;" : ""}
            const response = await fetch(location.href, { method: 'POST', headers: { 'Next-Action': 'local-fixture' } });
            await response.text();
            if (response.ok) location.href = ${JSON.stringify(scenario.destination ?? nextPath)};
          };
        </script>`}`);
    }
    if (url.pathname !== nextPath) return respond(404, "Unknown route");
    protectedRequests += 1;
    if (scenario.loseSession && protectedRequests > 1) {
      return respond(302, "", { location: "/login?next=%2Fadmin%2Fprogramma" });
    }
    return respond(200, scenario.missingUI ? "<h1>Public page</h1>" : heading);
  });
  const events: Array<{ event: string }> = [];
  const login = () => signInAdmin(page, "admin@example.test", "local-fixture-password", nextPath, {
    baseURL: server.baseURL,
    timeout: scenario.timeout ?? (scenario.destination || scenario.noSubmit || scenario.abort || scenario.missingUI || scenario.loseSession ? 750 : undefined),
    diagnostic: (event) => events.push(event)
  });
  return { login, submission, events, submits: () => submits, protectedRequests: () => protectedRequests };
}

test("normal action login submits once and checks protected UI on a second request", async ({ page, localServer }) => {
  const flow = await fixture(page, localServer);
  await flow.login();
  expect(flow.submits()).toBe(1);
  expect(flow.protectedRequests()).toBe(2);
  expect(flow.events.map(({ event }) => event)).toEqual([
    "fields-before-submit", "submit-click", "login-request", "login-response", "protected-ui", "protected-follow-up", "login-final-location"
  ]);
});

test("native server-action navigation also submits once", async ({ page, localServer }) => {
  const flow = await fixture(page, localServer, { nativeSubmit: true });
  await flow.login();
  expect(flow.submits()).toBe(1);
});

test("an in-flight login is never submitted again", async ({ page, localServer }) => {
  let complete!: () => void;
  const pending = new Promise<void>((resolve) => { complete = resolve; });
  const flow = await fixture(page, localServer, { pending });
  const result = flow.login();
  await flow.submission;
  expect(flow.submits()).toBe(1);
  expect(flow.events.some(({ event }) => event === "login-response")).toBe(false);
  complete();
  await result;
  expect(flow.submits()).toBe(1);
});

test("a form that never sends fails without claiming a cookie bounce", async ({ page, localServer }) => {
  const flow = await fixture(page, localServer, { noSubmit: true });
  await expect(flow.login()).rejects.toThrow(/waitForResponse/);
  expect(flow.submits()).toBe(0);
  expect(flow.events.map(({ event }) => event)).toEqual(["fields-before-submit", "submit-click", "login-final-location"]);
});

test("a timed-out pending action fails without a second submit", async ({ page, localServer }) => {
  let complete!: () => void;
  const pending = new Promise<void>((resolve) => { complete = resolve; });
  const flow = await fixture(page, localServer, { pending, timeout: 750 });
  try {
    await expect(flow.login()).rejects.toThrow(/waitForResponse/);
    expect(flow.submits()).toBe(1);
  } finally {
    complete();
  }
});

for (const destination of [
  "/login?next=%2Fadmin%2Fprogramma", "/login?next=/admin/programma",
  "/login?error=invalid_credentials", "/login?error=forbidden", "/login?error=", "/login?error=unknown",
  "/auth/wachtwoord-wijzigen", "/admin/programma-extra", "https://other.example/admin/programma"
]) {
  test(`completed login to ${destination} fails without resubmitting`, async ({ page, localServer }) => {
    const flow = await fixture(page, localServer, { destination });
    await expect(flow.login()).rejects.toThrow(/toHaveURL/);
    expect(flow.submits()).toBe(1);
  });
}

test("HTTP 200 and the expected URL without protected UI fail", async ({ page, localServer }) => {
  const flow = await fixture(page, localServer, { missingUI: true });
  await expect(flow.login()).rejects.toThrow(/toBeVisible/);
  expect(flow.submits()).toBe(1);
});

test("losing the session on the follow-up request fails", async ({ page, localServer }) => {
  const flow = await fixture(page, localServer, { loseSession: true });
  await expect(flow.login()).rejects.toThrow(/toHaveURL/);
  expect(flow.submits()).toBe(1);
});

test("server errors remain HTTP failures without retry", async ({ page, localServer }) => {
  const flow = await fixture(page, localServer, { status: 503 });
  await expect(flow.login()).rejects.toThrow(/HTTP error/);
  expect(flow.submits()).toBe(1);
});

test("network failures remain observable without retry", async ({ page, localServer }) => {
  const flow = await fixture(page, localServer, { abort: true });
  await expect(flow.login()).rejects.toThrow(/waitForResponse/);
  expect(flow.events.some(({ event }) => event === "login-network-failure")).toBe(true);
  expect(flow.submits()).toBe(1);
});
