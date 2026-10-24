"use client";
import { useSyncExternalStore } from "react";
import { slotStartInstant, type FacilityCode } from "@vitb/shared";

/*
 * PROTOTYPE STORAGE. Bookings are kept in this browser only, so they are not
 * visible to anyone else and do not reserve anything. Phase 4 replaces this
 * module with the booking API; the shapes below match that API.
 */

export type BookingStatus = "confirmed" | "checked_in" | "completed" | "cancelled";

export interface BookingFeedback {
  rating: "good" | "issue";
  description?: string;
  photoName?: string;
}

export interface Booking {
  id: string;
  facility: FacilityCode;
  resource: string;
  date: string;
  slotIndex: number;
  participants: number;
  participantRegNos?: string[];
  status: BookingStatus;
  createdAt: string;
  checkedInAt?: string;
  checkedOutAt?: string;
  feedback?: BookingFeedback;
}

export type NewBooking = Pick<Booking, "facility" | "resource" | "date" | "slotIndex" | "participants" | "participantRegNos">;

export class BookingRuleError extends Error {
  constructor(
    readonly code: "SLOT_TAKEN" | "DAILY_LIMIT" | "SLOT_STARTED",
    message: string,
  ) {
    super(message);
  }
}

const STORAGE_KEY = "vitb_sports_bookings_v2";
const LEGACY_KEYS = ["vitb_sports_bookings"];
const CHANGE_EVENT = "vitb-bookings-change";
const NO_BOOKINGS: Booking[] = [];

let cachedRaw: string | null = null;
let cachedBookings: Booking[] = NO_BOOKINGS;

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readSnapshot(): Booking[] {
  const raw = safeStorage()?.getItem(STORAGE_KEY) ?? null;
  if (raw === null) return NO_BOOKINGS;
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedBookings = JSON.parse(raw);
    } catch {
      cachedBookings = NO_BOOKINGS;
    }
  }
  return cachedBookings;
}

function write(bookings: Booking[]) {
  const storage = safeStorage();
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(bookings));
  for (const key of LEGACY_KEYS) storage.removeItem(key);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Reactive list of bookings on this device; empty during server rendering. */
export function useBookings(): Booking[] {
  return useSyncExternalStore(subscribe, readSnapshot, () => NO_BOOKINGS);
}

export const isActive = (b: Booking) => b.status === "confirmed" || b.status === "checked_in";

export function createBooking(input: NewBooking, now = new Date()): Booking {
  const all = readSnapshot();
  if (slotStartInstant(input.date, input.slotIndex) <= now) {
    throw new BookingRuleError("SLOT_STARTED", "This slot has already started. Choose a later time.");
  }
  const sameSlot = all.some(
    (b) => isActive(b) && b.facility === input.facility && b.resource === input.resource && b.date === input.date && b.slotIndex === input.slotIndex,
  );
  if (sameSlot) throw new BookingRuleError("SLOT_TAKEN", "You already have this slot.");
  const sameDay = all.some((b) => isActive(b) && b.facility === input.facility && b.date === input.date);
  if (sameDay) {
    throw new BookingRuleError("DAILY_LIMIT", "You can hold one booking per sport per day. Cancel your other booking first.");
  }

  const booking: Booking = { ...input, id: crypto.randomUUID(), status: "confirmed", createdAt: now.toISOString() };
  write([...all, booking]);
  return booking;
}

function update(id: string, patch: (b: Booking) => Partial<Booking>) {
  write(readSnapshot().map((b) => (b.id === id ? { ...b, ...patch(b) } : b)));
}

export function cancelBooking(id: string) {
  update(id, () => ({ status: "cancelled" }));
}

export function checkIn(id: string) {
  update(id, () => ({ status: "checked_in", checkedInAt: new Date().toISOString() }));
}

export function checkOut(id: string, feedback: BookingFeedback) {
  update(id, () => ({ status: "completed", checkedOutAt: new Date().toISOString(), feedback }));
}
