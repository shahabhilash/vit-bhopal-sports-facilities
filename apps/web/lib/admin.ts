"use client";
import { useCallback } from "react";
import type {
  AdminBookingDto,
  AnalyticsDto,
  BlockDto,
  BlockOverlapsDto,
  BlockReason,
  FeedbackItemDto,
  FeedbackStatus,
  StaffMemberDto,
} from "@vitb/shared";
import { apiFetch } from "./api";
import { revalidate, useApi } from "./use-api";

export function useAnalytics(from: string, to: string) {
  const fetcher = useCallback(() => apiFetch<AnalyticsDto>(`/v1/admin/analytics?from=${from}&to=${to}`, { auth: true }), [from, to]);
  return useApi(`admin:analytics:${from}:${to}`, fetcher);
}

export function useAdminBookings(date: string, facility: string) {
  const qs = `date=${date}${facility ? `&facility=${facility}` : ""}`;
  const fetcher = useCallback(() => apiFetch<AdminBookingDto[]>(`/v1/admin/bookings?${qs}`, { auth: true }), [qs]);
  return useApi(`admin:bookings:${qs}`, fetcher);
}

export async function adminCancelBooking(id: string, reason: string) {
  await apiFetch(`/v1/admin/bookings/${id}/cancel`, { method: "POST", body: { reason }, auth: true });
  await revalidate("admin:bookings");
}

export function useBlocks() {
  const fetcher = useCallback(() => apiFetch<BlockDto[]>("/v1/admin/blocks", { auth: true }), []);
  return useApi("admin:blocks", fetcher);
}

export interface BlockInput {
  facility: "pickleball" | "tennis" | "turf";
  resourceId: string | null;
  startDate: string;
  endDate: string;
  slotIndexes: number[] | null;
  reason: BlockReason;
  note?: string;
}

const scope = (b: BlockInput) => ({
  facility: b.facility,
  resourceId: b.resourceId,
  startDate: b.startDate,
  endDate: b.endDate,
  slotIndexes: b.slotIndexes,
});

export function previewBlock(b: BlockInput, excludeId?: string) {
  return apiFetch<BlockOverlapsDto>("/v1/admin/blocks/preview", {
    method: "POST",
    body: { ...scope(b), ...(excludeId ? { excludeId } : {}) },
    auth: true,
  });
}

export async function saveBlock(b: BlockInput, opts: { id?: string; cancelAffected: boolean }) {
  const body = { ...scope(b), reason: b.reason, note: b.note || undefined, cancelAffected: opts.cancelAffected };
  const result = await apiFetch<{ block: BlockDto; cancelled: number }>(opts.id ? `/v1/admin/blocks/${opts.id}` : "/v1/admin/blocks", {
    method: opts.id ? "PATCH" : "POST",
    body,
    auth: true,
  });
  await Promise.all([revalidate("admin:blocks"), revalidate("admin:bookings")]);
  return result;
}

export async function deleteBlock(id: string) {
  await apiFetch(`/v1/admin/blocks/${id}`, { method: "DELETE", auth: true });
  await revalidate("admin:blocks");
}

export interface FeedbackFilters {
  status: FeedbackStatus | "";
  facility: string;
  rating: "good" | "issue" | "";
}

export function useFeedback(f: FeedbackFilters, offset: number) {
  const params = new URLSearchParams();
  if (f.status) params.set("status", f.status);
  if (f.facility) params.set("facility", f.facility);
  if (f.rating) params.set("rating", f.rating);
  params.set("limit", "20");
  params.set("offset", String(offset));
  const qs = params.toString();
  const fetcher = useCallback(
    () => apiFetch<{ total: number; items: FeedbackItemDto[] }>(`/v1/admin/feedback?${qs}`, { auth: true }),
    [qs],
  );
  return useApi(`admin:feedback:${qs}`, fetcher);
}

export async function setFeedbackStatus(id: string, status: FeedbackStatus) {
  await apiFetch(`/v1/admin/feedback/${id}`, { method: "PATCH", body: { status }, auth: true });
  await revalidate("admin:feedback");
}

export function feedbackPhotoUrl(id: string) {
  return apiFetch<{ url: string; expiresIn: number }>(`/v1/admin/feedback/${id}/photo`, { auth: true });
}

export function useStaff() {
  const fetcher = useCallback(() => apiFetch<StaffMemberDto[]>("/v1/admin/staff", { auth: true }), []);
  return useApi("admin:staff", fetcher);
}

export async function setStaffRole(email: string, role: "guard" | "sports_admin", grant: boolean) {
  await apiFetch<StaffMemberDto[]>("/v1/admin/staff", { method: "POST", body: { email, role, grant }, auth: true });
  await revalidate("admin:staff");
}
