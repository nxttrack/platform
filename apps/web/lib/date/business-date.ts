export const businessTimeZone = "Europe/Amsterdam";

const formatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  timeZone: businessTimeZone,
  year: "numeric"
});

export function toAmsterdamDate(value: Date | number | string = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid business date input");
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type === "day" || part.type === "month" || part.type === "year")
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addAmsterdamCalendarDays(value: Date | number | string, days: number): string {
  if (!Number.isInteger(days)) throw new RangeError("Business date offset must be an integer");
  const [year, month, day] = toAmsterdamDate(value).split("-").map(Number);
  const offsetAtUtcNoon = new Date(Date.UTC(year, month - 1, day + days, 12));
  return toAmsterdamDate(offsetAtUtcNoon);
}
