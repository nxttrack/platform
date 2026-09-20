import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import type { Frame, Page, Request, Response } from "@playwright/test";
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";

type Destination = "expected" | "login" | "unexpected";
type Role = "owner" | "tenant-admin" | "instructor" | "parent";
type Event = {
  event: string; elapsedMs: number; destination?: Destination; explicitError?: boolean;
  method?: string; status?: number; fieldsPresent?: boolean; requestElapsedMs?: number;
};
type Diagnostic = {
  beforeClick(email: string, password: string): Promise<void>;
  originalAssertion(assertion: () => Promise<void>): Promise<void>;
};
const PASSIVE_OBSERVATION_MS = 15_000;

function roleFor(nextPath: string): Role {
  if (nextPath === "/platform/badges") return "owner";
  if (nextPath === "/admin/badges") return "tenant-admin";
  if (/^\/instructor\/student\/[0-9a-f-]{36}\?tab=badges$/.test(nextPath)) return "instructor";
  if (nextPath === "/portaal/ontwikkeling/badges") return "parent";
  throw new Error("Unsupported diagnostic destination");
}

function writeReport(name: string, report: unknown, directory = process.env.DIAGNOSTIC_OUTPUT_DIR) {
  if (!directory || !path.isAbsolute(directory)) throw new Error("Absolute diagnostic output directory required");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(path.join(directory, name), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}

/** Wraps the unchanged assertion. Observers never resubmit, reload, or override a failure. */
export async function diagnoseCommunicationLogin(
  page: Page,
  nextPath: string,
  original: (diagnostic: Diagnostic) => Promise<void>,
  options: { baseURL?: string; outputDirectory?: string } = {}
) {
  const baseURL = options.baseURL ?? process.env.PLAYWRIGHT_BASE_URL;
  if (!baseURL) throw new Error("Diagnostic base URL required");
  const expected = new URL(nextPath, baseURL);
  const role = roleFor(nextPath);
  const started = performance.now();
  const events: Event[] = [];
  let eventsDropped = 0;
  let assertionStatus: "not-reached" | "passed" | "failed" = "not-reached";
  let originalFailed = false;
  let lateExpectedNavigation = false;
  let observationElapsedMs = 0;
  const requests = new WeakMap<Request, number>();
  const elapsed = () => Math.round(performance.now() - started);
  const classify = (url: string): { destination: Destination; explicitError: boolean } => {
    try {
      const actual = new URL(url);
      return { destination: actual.origin !== expected.origin ? "unexpected"
        : actual.pathname === expected.pathname ? "expected"
          : actual.pathname === "/login" ? "login" : "unexpected",
      explicitError: actual.searchParams.has("error") };
    } catch { return { destination: "unexpected", explicitError: false }; }
  };
  const record = (event: string, details: Omit<Event, "event" | "elapsedMs"> = {}) => {
    if (events.length < 200) events.push({ event, elapsedMs: elapsed(), ...details });
    else eventsDropped += 1;
  };
  const relevant = (request: Request) => classify(request.url()).destination === "login"
    || (request.isNavigationRequest() && request.frame() === page.mainFrame());
  const requestDetails = (request: Request) => ({
    ...classify(request.url()),
    method: ["GET", "POST", "HEAD", "OPTIONS", "PUT", "PATCH", "DELETE"].includes(request.method()) ? request.method() : "OTHER"
  });
  const onRequest = (request: Request) => {
    if (!relevant(request)) return;
    requests.set(request, performance.now());
    record("request", requestDetails(request));
  };
  const onResponse = (response: Response) => {
    const request = response.request();
    if (!relevant(request)) return;
    record("response", { ...requestDetails(request), status: response.status(),
      requestElapsedMs: Math.round(performance.now() - (requests.get(request) ?? performance.now())) });
  };
  const onFinished = (request: Request) => { if (relevant(request)) record("request-finished", requestDetails(request)); };
  const onFailed = (request: Request) => { if (relevant(request)) record("request-failed", requestDetails(request)); };
  const onNavigation = (frame: Frame) => { if (frame === page.mainFrame()) record("navigation", classify(frame.url())); };
  page.on("request", onRequest);
  page.on("response", onResponse);
  page.on("requestfinished", onFinished);
  page.on("requestfailed", onFailed);
  page.on("framenavigated", onNavigation);
  const bounded = async <T>(operation: Promise<T>): Promise<T | null> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([operation.catch(() => null), new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 750); })]); }
    finally { clearTimeout(timer); }
  };
  try {
    await original({
      beforeClick: async (email, password) => {
        const fieldsPresent = await bounded(page.locator("input[name='password']").evaluate((input, credentials) => {
          const form = (input as HTMLInputElement).form;
          if (!form) return false;
          const data = new FormData(form);
          return data.get("email") === credentials.email && data.get("password") === credentials.password;
        }, { email, password }));
        record("before-click", { fieldsPresent: fieldsPresent === true, ...classify(page.url()) });
      },
      originalAssertion: async (assertion) => {
        record("original-assertion-start", classify(page.url()));
        try {
          await assertion();
          assertionStatus = "passed";
          record("original-assertion-passed", classify(page.url()));
        } catch (originalError) {
          assertionStatus = "failed";
          record("original-assertion-failed", classify(page.url()));
          const observing = performance.now();
          // No clicks, reloads, requests or session mutation: only observe this page.
          try {
            await page.waitForURL((url) => classify(url.href).destination === "expected", {
              timeout: PASSIVE_OBSERVATION_MS, waitUntil: "domcontentloaded"
            });
            lateExpectedNavigation = true;
          } catch { /* The original assertion remains the decisive failure. */ }
          observationElapsedMs = Math.round(performance.now() - observing);
          record("passive-observation-finished", classify(page.url()));
          throw originalError;
        }
      }
    });
  } catch (originalError) {
    originalFailed = true;
    throw originalError;
  } finally {
    // Cookie presence is a heuristic, not proof of a valid server-side session.
    const authCookiePresentHeuristic = await bounded(page.context().cookies().then((cookies) =>
      cookies.some((cookie) => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name) && cookie.value.length > 0)));
    const loginFieldsPresent = await bounded(page.locator("input[name='password']").count().then((count) => count > 0));
    record("final-location", classify(page.url()));
    page.off("request", onRequest);
    page.off("response", onResponse);
    page.off("requestfinished", onFinished);
    page.off("requestfailed", onFailed);
    page.off("framenavigated", onNavigation);
    const report = {
      schemaVersion: 1, diagnosticOnly: true, role, capturedAt: new Date().toISOString(),
      canonicalReleaseSha: process.env.RELEASE_SHA, instrumentationSha: process.env.INSTRUMENTATION_SHA,
      elapsedMs: elapsed(), assertionStatus, originalFailed, observationLimitMs: PASSIVE_OBSERVATION_MS,
      observationElapsedMs, lateExpectedNavigation, authCookiePresentHeuristic, loginFieldsPresent,
      finalLocation: classify(page.url()), eventsDropped, events
    };
    try { writeReport(`login-${role}.json`, report, options.outputDirectory); }
    catch { if (!originalFailed) throw new Error("Cannot persist sanitized login diagnostic"); }
  }
}

/** Never print Playwright errors, titles, attachments, credentials, or page URLs. */
export default class SanitizedDiagnosticReporter implements Reporter {
  private counts = { passed: 0, failed: 0, skipped: 0, timedOut: 0, interrupted: 0 };
  private globalErrors = 0;
  onTestEnd(_test: TestCase, result: TestResult) { this.counts[result.status] += 1; }
  onError() { this.globalErrors += 1; }
  onEnd(result: FullResult) {
    writeReport("suite-summary.json", {
      schemaVersion: 1, diagnosticOnly: true, capturedAt: new Date().toISOString(),
      canonicalReleaseSha: process.env.RELEASE_SHA, instrumentationSha: process.env.INSTRUMENTATION_SHA,
      status: result.status, counts: this.counts, globalErrors: this.globalErrors
    });
    process.stdout.write(`Communication diagnostic: ${result.status}; ${this.counts.passed} passed, ${this.counts.failed + this.counts.timedOut} failed.\n`);
  }
}
