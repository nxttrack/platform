import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
test.use({ actionTimeout: 15_000 });

async function login(page: Page, email: string, password: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Wachtwoord", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Inloggen", exact: true }).click();
}

test("separate instructor, parent and child sessions share only confirmed assessments and explicitly published compliments", async ({ page, browser, baseURL }, info) => {
  const file = process.env.PORTAL_ASSESSMENT_BROWSER_FIXTURE;
  test.skip(!file, "Requires an explicitly seeded fictional instructor/family in a local database");
  if (!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) throw new Error("Assessment browser writes require a loopback application");
  const f = JSON.parse(readFileSync(file!, "utf8"));
  const parentContext = await browser.newContext(), childContext = await browser.newContext();
  const parent = await parentContext.newPage(), child = await childContext.newPage();
  const dossier = `/instructor/student/${f.child}?tab=assessment`, development = `/portaal/ontwikkeling?kind=${f.child}`;
  try {
    await login(page, f.teacherEmail, f.teacherPassword, dossier);
    const card = page.locator(`[data-assessment-card="${f.item}"]`);
    await expect(card).toBeVisible({ timeout: 45_000 });
    await expect(card).toContainText("Nog niet beoordeeld");
    await card.locator("label").filter({ has: page.getByRole("radio", { name: /^3 van 5/ }) }).click();
    await expect(card.getByRole("status").first()).toHaveText("Privéconcept opgeslagen");
    await page.reload(); await expect(card.getByRole("radio", { name: /^3 van 5/ })).toBeChecked();
    await expect(card).toContainText("Opgeslagen: Nog niet beoordeeld");
    await login(parent, f.email, f.password, development);
    const parentRow = parent.locator('[data-development-skill="fictional-breathing"]');
    await expect(parentRow).toContainText("Nog niet beoordeeld", { timeout: 45_000 });
    // A failed save preserves the score and review, including after ordinary network recovery.
    await card.getByRole("button", { name: "Controleren en bewaren", exact: true }).click();
    const review = page.getByRole("dialog", { name: "Beoordeling controleren", exact: true });
    await expect(review).toContainText("Van nog niet beoordeeld naar 3 / 5");
    await expect(review.getByRole("button", { name: "Beoordeling bewaren", exact: true })).toBeDisabled();
    await review.getByRole("checkbox").check();
    await page.route("**/instructor/student/**", (route) => route.request().method() === "POST" ? route.abort("failed") : route.continue());
    await review.getByRole("button", { name: "Beoordeling bewaren", exact: true }).click();
    await expect(review.getByRole("alert")).toContainText("verbinding");
    await parent.reload(); await expect(parentRow).toContainText("Nog niet beoordeeld");
    await page.unroute("**/instructor/student/**");
    await page.screenshot({ path: info.outputPath("instructor-review-retry.png") });
    await review.getByRole("button", { name: "Beoordeling bewaren", exact: true }).click();
    await expect(review).not.toBeVisible(); await expect(card).toContainText("Opgeslagen: 3 / 5");
    await parent.reload(); await expect(parentRow).toContainText("3 / 5"); await expect(parentRow).toContainText("Behaald");
    // Enter through the actual parent action with its own freshly authenticated session.
    await login(child, f.email, f.password, "/portaal/kinderen");
    await child.locator("article").filter({ hasText: "Fictieve Lotte" }).getByRole("button", { name: /^Open kindmodus/ }).click();
    await expect(child).toHaveURL(/\/kind$/);
    const childDetailHref = "/kind/reis?onderdeel=fictional-breathing&detail=1";
    await child.goto(childDetailHref);
    const detail = child.getByRole("dialog", { name: "Fictief rustig ademen", exact: true });
    await expect(detail).toContainText("3 / 5");
    await expect(detail.getByText("Mooi op weg", { exact: true })).toHaveCount(0);
    await expect(child.getByRole("link", { name: /inbox|betalen/i })).toHaveCount(0);
    await card.getByRole("button", { name: "Kindcompliment schrijven", exact: true }).click();
    const publish = page.getByRole("dialog", { name: "Kindcompliment publiceren", exact: true });
    await publish.getByRole("textbox", { name: "Positief compliment" }).fill("Je hebt heel rustig geoefend, goed gedaan!");
    await expect(publish.getByRole("button", { name: "Publiceer kindcompliment", exact: true })).toBeDisabled();
    await publish.getByRole("checkbox").check();
    await publish.getByRole("button", { name: "Publiceer kindcompliment", exact: true }).click();
    await expect(publish).not.toBeVisible();
    await child.reload(); await expect(detail).toContainText("Je hebt heel rustig geoefend, goed gedaan!");
    await child.screenshot({ path: info.outputPath("child-explicit-compliment.png") });
    const privateNote = `PRIVATE_REVIEW_${f.child}`;
    await page.goto(`/instructor/student/${f.child}?tab=notes`);
    await page.getByRole("textbox", { name: "Notitie", exact: true }).fill(privateNote);
    await page.getByRole("button", { name: "Notitie opslaan", exact: true }).click();
    await expect(page.getByText(privateNote, { exact: true })).toBeVisible();
    await parent.reload(); await child.reload();
    expect(await parent.content()).not.toContain(privateNote); expect(await child.content()).not.toContain(privateNote);
    await page.goto(dossier);
    await page.getByRole("button", { name: "Nieuw bericht", exact: true }).click();
    const teacherComposer = page.getByRole("dialog", { name: "Nieuw bericht", exact: true });
    await teacherComposer.getByRole("textbox", { name: "Onderwerp", exact: true }).fill("Afzonderlijke fictieve ouderupdate");
    await teacherComposer.getByRole("textbox", { name: "Bericht", exact: true }).fill("Fictieve ouderupdate, afzonderlijk van beoordeling en interne notitie.");
    await teacherComposer.getByRole("button", { name: "Controleren en versturen" }).click();
    const teacherReview = page.getByRole("dialog", { name: "Bericht controleren", exact: true });
    await expect(teacherReview).toContainText("Fictieve Lotte");
    await teacherReview.getByRole("checkbox").check();
    await teacherReview.getByRole("button", { name: "Bericht versturen", exact: true }).click();
    await expect(page.getByRole("log")).toContainText("Fictieve ouderupdate, afzonderlijk van beoordeling en interne notitie.");
    expect(await page.getByRole("log").textContent()).not.toContain(privateNote);
    // Read-only parent detail supplies a real item reference and the sent message links back to it.
    await parentRow.getByRole("button", { name: "Bekijk Fictief rustig ademen", exact: true }).click();
    await parent.getByRole("dialog", { name: "Fictief rustig ademen", exact: true }).getByRole("link", { name: "Vraag over dit onderdeel" }).click();
    const compose = parent.getByRole("dialog", { name: "Nieuw bericht", exact: true });
    await expect(compose).toContainText("Fictief rustig ademen");
    await compose.getByRole("textbox", { name: "Bericht", exact: true }).fill("Fictieve vraag over de bevestigde beoordeling.");
    await compose.getByRole("button", { name: "Controleren en versturen" }).click();
    const messageReview = parent.getByRole("dialog", { name: "Bericht controleren", exact: true });
    await messageReview.getByRole("checkbox").check();
    await messageReview.getByRole("button", { name: "Bericht versturen", exact: true }).click();
    await parent.getByRole("log").getByRole("link", { name: "Fictief rustig ademen", exact: true }).click();
    await expect(parent.getByRole("dialog", { name: "Fictief rustig ademen", exact: true })).toContainText("3 / 5");
    await parent.goto(`/portaal/ontwikkeling?kind=${f.otherChild}`);
    await expect(parent.locator('[data-development-skill="fictional-breathing"]')).toHaveCount(0);
    // The locked child session cannot reach teacher commands or the parent inbox.
    await child.goto(dossier); await expect(child.locator("[data-assessment-card]")).toHaveCount(0);
    await child.goto("/portaal/inbox"); await expect(child.getByRole("textbox", { name: "Bericht", exact: true })).toHaveCount(0);
  } finally { await parentContext.close(); await childContext.close(); }
});
