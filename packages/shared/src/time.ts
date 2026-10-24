import { getSlot } from "./slots";

export const BUSINESS_TIME_ZONE = "Asia/Kolkata";
/** India has no daylight saving, so the offset is constant. */
export const IST_OFFSET = "+05:30";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const istDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date ("YYYY-MM-DD") in IST for an instant. Never use toISOString() for this. */
export function istDateString(instant: Date = new Date()): string {
  return istDateFormatter.format(instant);
}

export function isIsoDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, for an IST calendar date. */
export function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function istInstant(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00${IST_OFFSET}`);
}

export function slotStartInstant(date: string, slotIndex: number): Date {
  const slot = getSlot(slotIndex);
  if (!slot) throw new RangeError(`Unknown slot index ${slotIndex}`);
  return istInstant(date, slot.start);
}

/**
 * Turf release rule (decision Q2): turf weeks run Saturday → Friday, and each
 * week opens at 12:00 IST on the Friday before it starts. Once released, a date
 * stays bookable until its slots begin.
 *
 * The database booking function is the authority; this copy is for display.
 */
export function turfReleaseInstant(date: string): Date {
  const daysSinceSaturday = (dayOfWeek(date) + 1) % 7;
  const weekStart = addDays(date, -daysSinceSaturday);
  return istInstant(addDays(weekStart, -1), "12:00");
}
