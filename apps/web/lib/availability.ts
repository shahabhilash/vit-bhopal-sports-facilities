import {
  TIME_SLOTS,
  addDays,
  istDateString,
  slotStartInstant,
  turfReleaseInstant,
  type AvailabilityEntry,
  type TimeSlot,
} from "@vitb/shared";
import { FACILITIES, type BookableCode } from "./catalog";
import { isActive, type Booking } from "./bookings";

/** Decision Q10: waiting lists close 2 hours before the start. */
export const WAITLIST_LEAD_MS = 2 * 60 * 60 * 1000;

export type SlotState =
  | { kind: "open" }
  | { kind: "mine"; bookingId: string }
  /** waitlist: the slot is far enough ahead (2 h) to join its waiting list. */
  | { kind: "booked"; waitlist: boolean }
  | { kind: "blocked"; reason: string }
  | { kind: "past" }
  | { kind: "not_released"; opensAt: Date }
  | { kind: "loading" };

export interface DateOption {
  date: string;
  /** Turf dates before their Friday release are listed but locked. */
  opensAt: Date | null;
}

/** Dates a student can pick for a facility, in IST, starting today. */
export function bookableDates(code: BookableCode, now: Date): DateOption[] {
  const today = istDateString(now);
  const rule = FACILITIES[code].rule;
  const lastSlot = TIME_SLOTS[TIME_SLOTS.length - 1]!;
  const days = rule.releaseRule === "weekly_friday_noon" ? 8 : (rule.bookingHorizonDays ?? 7);

  const options: DateOption[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    if (slotStartInstant(date, lastSlot.index) <= now) continue; // nothing left today
    let opensAt: Date | null = null;
    if (rule.releaseRule === "weekly_friday_noon") {
      const release = turfReleaseInstant(date);
      opensAt = release > now ? release : null;
    }
    options.push({ date, opensAt });
  }
  return options;
}

/**
 * Slot states for one resource and date, from the server's availability
 * (taken and blocked slots) and the caller's own bookings. Display only: the
 * server decides when the booking is submitted.
 */
export function slotStates(
  code: BookableCode,
  resourceId: string | null,
  date: string,
  availability: AvailabilityEntry[] | undefined,
  myBookings: Booking[] | undefined,
  now: Date,
): { slot: TimeSlot; state: SlotState }[] {
  const opensAt = FACILITIES[code].rule.releaseRule === "weekly_friday_noon" ? turfReleaseInstant(date) : null;
  return TIME_SLOTS.map((slot) => {
    const mine = myBookings?.find(
      (b) => isActive(b) && b.resourceId === resourceId && b.date === date && b.slotIndex === slot.index,
    );
    const entry = availability?.find((e) => e.resourceId === resourceId && e.date === date && e.slotIndex === slot.index);
    let state: SlotState;
    if (mine) state = { kind: "mine", bookingId: mine.id };
    else if (slotStartInstant(date, slot.index) <= now) state = { kind: "past" };
    else if (opensAt && opensAt > now) state = { kind: "not_released", opensAt };
    else if (!availability || !resourceId) state = { kind: "loading" };
    else if (entry?.state === "blocked") state = { kind: "blocked", reason: entry.label ?? "Unavailable" };
    else if (entry?.state === "booked") {
      state = { kind: "booked", waitlist: slotStartInstant(date, slot.index).getTime() - now.getTime() >= WAITLIST_LEAD_MS };
    }
    else state = { kind: "open" };
    return { slot, state };
  });
}

export interface TurfWindow {
  /** Last date currently open for booking, or null if none. */
  openThrough: string | null;
  nextRelease: Date;
  nextWeekStart: string;
  nextWeekEnd: string;
}

/** What is bookable on the turf right now and when the next week opens. */
export function turfWindow(now: Date): TurfWindow {
  const today = istDateString(now);
  let openThrough: string | null = null;
  let date = today;
  while (turfReleaseInstant(date) <= now) {
    openThrough = date;
    date = addDays(date, 1);
  }
  return {
    openThrough,
    nextRelease: turfReleaseInstant(date),
    nextWeekStart: date,
    nextWeekEnd: addDays(date, 6),
  };
}
