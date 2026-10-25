"use client";
import { useCallback } from "react";
import type { AvailabilityEntry, BookingDto, CreateBookingInput, ProfileDto, ResourceDto } from "@vitb/shared";
import { apiFetch } from "./api";
import { revalidate, useApi } from "./use-api";
import type { SessionStatus } from "./supabase/session";

export type { BookingDto as Booking, BookingStatus } from "@vitb/shared";

export const isActive = (b: BookingDto) => b.status === "confirmed" || b.status === "checked_in";

export function useResources() {
  const fetcher = useCallback(() => apiFetch<ResourceDto[]>("/v1/facilities"), []);
  return useApi("facilities", fetcher);
}

export function useAvailability(facility: string, from: string | null, to: string | null) {
  const key = from && to ? `availability:${facility}:${from}:${to}` : null;
  const fetcher = useCallback(
    () => apiFetch<AvailabilityEntry[]>(`/v1/availability?facility=${facility}&from=${from}&to=${to}`),
    [facility, from, to],
  );
  return useApi(key, fetcher);
}

/** The signed-in user's bookings; null key (no request) when signed out. */
export function useMyBookings(session: SessionStatus) {
  const fetcher = useCallback(() => apiFetch<BookingDto[]>("/v1/bookings", { auth: true }), []);
  return useApi(session === "signed-in" ? "my-bookings" : null, fetcher);
}

export function useProfile(session: SessionStatus) {
  const fetcher = useCallback(() => apiFetch<ProfileDto>("/v1/me", { auth: true }), []);
  return useApi(session === "signed-in" ? "me" : null, fetcher);
}

export async function createBooking(input: CreateBookingInput, idempotencyKey: string): Promise<BookingDto> {
  try {
    return await apiFetch<BookingDto>("/v1/bookings", { method: "POST", body: input, auth: true, idempotencyKey });
  } finally {
    // Success or conflict, the slot picture may have changed.
    void revalidate("availability:");
    void revalidate("my-bookings");
  }
}

export async function cancelBooking(id: string): Promise<BookingDto> {
  const booking = await apiFetch<BookingDto>(`/v1/bookings/${id}/cancel`, { method: "POST", auth: true });
  void revalidate("availability:");
  await revalidate("my-bookings");
  return booking;
}

export async function updateProfile(input: { fullName?: string; regNo?: string }): Promise<ProfileDto> {
  const profile = await apiFetch<ProfileDto>("/v1/me", { method: "PATCH", body: input, auth: true });
  await revalidate("me");
  return profile;
}
