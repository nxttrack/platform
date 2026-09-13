import { businessTimeZone } from "./business-date";

export function resolveChildTimeZone(configured: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat("nl-NL", { timeZone: configured || businessTimeZone }).resolvedOptions().timeZone;
  } catch {
    return businessTimeZone;
  }
}

export function formatChildLessonDate(value: string, options: Intl.DateTimeFormatOptions, timeZone: string) {
  return new Intl.DateTimeFormat("nl-NL", { ...options, timeZone }).format(new Date(value));
}

export function childLessonCalendarDaysUntil(startsAt: string, timeZone: string, now = new Date()): number {
  const calendarDay = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "numeric", day: "numeric" })
      .formatToParts(date);
    const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
    return Date.UTC(part("year"), part("month") - 1, part("day"));
  };
  return Math.max(0, (calendarDay(new Date(startsAt)) - calendarDay(now)) / 86_400_000);
}
