"use client";
import { useSyncExternalStore } from "react";

// One shared clock for the page, refreshed every 30 seconds. On the server it
// is null, so time-dependent UI renders only in the browser (no hydration
// mismatch). Booking rules never rely on this clock; the server re-checks.
let current: Date | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(() => {
      current = new Date();
      listeners.forEach((l) => l());
    }, 30_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot() {
  current ??= new Date();
  return current;
}

export function useNow(): Date | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
