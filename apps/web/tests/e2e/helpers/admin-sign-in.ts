import { expect, type Page, type Request } from "@playwright/test";

export function isLoginDestination(actual: URL, expected: URL) {
  return actual.origin === expected.origin && actual.pathname === expected.pathname;
}

type LoginEvent = {
  event: string;
  elapsedMs: number;
  status?: number;
  fieldsPresent?: boolean;
  destination?: "expected" | "login" | "unexpected";
  explicitError?: boolean;
};

/** One UI submission. A login URL alone never establishes a session bounce. */
export async function signInAdmin(
  page: Page,
  email: string,
  password: string,
  nextPath: string,
  options: { baseURL: string; timeout?: number; diagnostic?: (event: LoginEvent) => void }
) {
  const timeout = options.timeout ?? 5_000;
  const started = Date.now();
  const record = (event: string, details: Omit<LoginEvent, "event" | "elapsedMs"> = {}) =>
    options.diagnostic?.({ event, elapsedMs: Date.now() - started, ...details });
  // Resolve against Playwright's configured origin, not an observed redirect host.
  const expected = new URL(nextPath, options.baseURL);
  const login = new URL("/login", expected);
  login.searchParams.set("next", nextPath);
  await page.goto(login.href, { waitUntil: "domcontentloaded" });
  expect(new URL(page.url()).origin, "Login must remain on the configured origin").toBe(expected.origin);
  const matchesAction = (request: Request) => {
    const url = new URL(request.url());
    return request.method() === "POST" && isLoginDestination(url, login)
      && (Boolean(request.headers()["next-action"]) || request.isNavigationRequest());
  };
  const onRequest = (request: Request) => {
    if (matchesAction(request)) record("login-request");
  };
  const onFailed = (request: Request) => {
    if (matchesAction(request)) record("login-network-failure");
  };
  page.on("request", onRequest);
  page.on("requestfailed", onFailed);
  try {
    await page.locator("input[name='email']").fill(email);
    await page.locator("input[name='password']").fill(password);
    const fieldsPresent = await page.locator("form").filter({ has: page.locator("input[name='password']") })
      .evaluate((form, credentials) => {
        const data = new FormData(form as HTMLFormElement);
        return data.get("email") === credentials.email && data.get("password") === credentials.password;
      }, { email, password });
    record("fields-before-submit", { fieldsPresent });
    expect(fieldsPresent, "Login fields must retain their values before submit").toBe(true);

    // Register before clicking; DOMContentLoaded may already have fired for /login.
    const responsePromise = page.waitForResponse((response) => matchesAction(response.request()), { timeout });
    record("submit-click");
    const [response] = await Promise.all([
      responsePromise,
      page.getByRole("button", { name: /^inloggen$/i }).click()
    ]);
    record("login-response", { status: response.status() });
    expect([200, 303], "Login action must complete without an HTTP error").toContain(response.status());
    await response.finished();
    await expect(page).toHaveURL((url) => isLoginDestination(url, expected), { timeout });
    const protectedHeading = page.getByRole("heading", { name: "Programma's en leerlijnen", exact: true });
    await expect(protectedHeading).toBeVisible({ timeout });
    record("protected-ui");

    // A new document request verifies that the session survives the redirect.
    const protectedResponse = await page.reload({ waitUntil: "domcontentloaded" });
    expect(protectedResponse?.status(), "Protected follow-up request must succeed").toBe(200);
    await expect(page).toHaveURL((url) => isLoginDestination(url, expected), { timeout });
    await expect(protectedHeading).toBeVisible({ timeout });
    record("protected-follow-up", { status: protectedResponse!.status() });
  } finally {
    const finalUrl = new URL(page.url());
    record("login-final-location", {
      destination: isLoginDestination(finalUrl, expected) ? "expected"
        : isLoginDestination(finalUrl, login) ? "login" : "unexpected",
      explicitError: finalUrl.searchParams.has("error")
    });
    page.off("request", onRequest);
    page.off("requestfailed", onFailed);
  }
}
