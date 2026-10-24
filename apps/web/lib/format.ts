import { BUSINESS_TIME_ZONE, addDays, getSlot, istDateString } from "@vitb/shared";

const weekdayShort = new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const instantFormat = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: BUSINESS_TIME_ZONE,
});

const timeFormat = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: BUSINESS_TIME_ZONE });

// IST calendar dates ("YYYY-MM-DD") are formatted as UTC midnight so the
// viewer's own time zone can never shift the day.
const asUtc = (date: string) => new Date(`${date}T00:00:00Z`);

export function relativeDayLabel(date: string, now = new Date()): string {
  const today = istDateString(now);
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  return weekdayShort.format(asUtc(date));
}

export const formatDayMonth = (date: string) => dayMonth.format(asUtc(date));
export const formatLongDate = (date: string) => longDate.format(asUtc(date));
export const formatInstant = (instant: Date) => instantFormat.format(instant).replace(/\b(am|pm)\b/, (m) => m.toUpperCase());
export const formatTime = (instant: Date) => timeFormat.format(instant).replace(/\b(am|pm)\b/, (m) => m.toUpperCase());
export const slotLabel = (index: number) => getSlot(index)?.label ?? `Slot ${index}`;
