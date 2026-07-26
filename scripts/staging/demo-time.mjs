export function localDateInTimeZone(date, zone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function addYears(dateString, years) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

export function occurrenceForWeekday(baseDate, weekday, time, weekOffset, zone) {
  const base = new Date(`${baseDate}T12:00:00Z`);
  const currentWeekday = base.getUTCDay() === 0 ? 7 : base.getUTCDay();
  base.setUTCDate(base.getUTCDate() + (weekday - currentWeekday) + weekOffset * 7);
  const calendarDate = base.toISOString().slice(0, 10);
  return zonedDateTimeToUtc(calendarDate, time, zone);
}

export function localNoonIso(dateString, zone) {
  return zonedDateTimeToUtc(dateString, "12:00", zone).toISOString();
}

export function zonedDateTimeToUtc(dateString, time, zone) {
  const [year, month, day] = dateString.split("-").map(Number);
  const [hour, minute] = String(time).split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let candidate = desired;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map((part) => [part.type, part.value]));
    const observed = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const correction = desired - observed;
    candidate += correction;
    if (correction === 0) break;
  }
  return new Date(candidate);
}
