import type { Page } from "@playwright/test";

export function instructorRosterEntry(page: Page, participantId: string) {
  const attendanceForm = page.locator("form")
    .filter({ has: page.locator(`input[name="participantId"][value="${participantId}"]`) })
    .filter({ has: page.getByRole("button", { name: "Laat", exact: true }) });
  return page.locator("article")
    .filter({ has: page.locator(`a[href="/instructor/student/${participantId}"]`) })
    .filter({ has: attendanceForm });
}
