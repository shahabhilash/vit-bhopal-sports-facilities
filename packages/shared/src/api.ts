import { z } from "zod";
import type { FacilityCode } from "./facilities";
import { isIsoDate } from "./time";

/** Contract between apps/web and apps/api. Mirrors the JSON built by the database functions. */

export type BookingStatus = "confirmed" | "checked_in" | "completed" | "cancelled" | "no_show";

export interface BookingDto {
  id: string;
  facility: FacilityCode;
  resourceId: string;
  resource: string;
  date: string;
  slotIndex: number;
  startsAt: string;
  participants: number;
  status: BookingStatus;
  /** False when the caller is a listed player on someone else's turf booking. */
  isOwner: boolean;
  createdAt: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  /** Set when the sports office cancelled the booking, e.g. for a block. */
  cancelReason: string | null;
}

export interface ResourceDto {
  id: string;
  facility: FacilityCode;
  name: string;
}

export interface AvailabilityEntry {
  resourceId: string;
  date: string;
  slotIndex: number;
  state: "booked" | "blocked";
  /** Public reason for blocked slots, e.g. "Under maintenance". */
  label?: string;
}

export interface ProfileDto {
  id: string;
  email: string;
  fullName: string | null;
  regNo: string | null;
  roles: string[];
}

const isoDate = z.string().refine(isIsoDate, "must be a date in YYYY-MM-DD format");

export const createBookingSchema = z
  .object({
    resourceId: z.uuid(),
    date: isoDate,
    slotIndex: z.number().int().min(1).max(12),
    participantCount: z.number().int().min(1).max(26).optional(),
    participantRegNos: z.array(z.string().max(20)).max(40).optional(),
  })
  .strict();
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const availabilityQuerySchema = z
  .object({
    facility: z.enum(["pickleball", "tennis", "turf"]),
    from: isoDate,
    to: isoDate,
  })
  .strict();

export const updateProfileSchema = z
  .object({
    fullName: z.string().trim().min(1).max(100).optional(),
    regNo: z.string().max(20).optional(),
  })
  .strict()
  .refine((v) => v.fullName !== undefined || v.regNo !== undefined, "nothing to update");

export interface BookingPassDto {
  bookingId: string;
  /** Encoded in the QR code. Contains no personal data. */
  code: string;
}

export type ScanResult =
  | "checked_in"
  | "already_checked_in"
  | "already_completed"
  | "too_early"
  | "expired"
  | "wrong_day"
  | "cancelled"
  | "invalid";

export interface GuardScanDto {
  result: ScanResult;
  booking?: {
    facility: FacilityCode;
    resource: string;
    date: string;
    slotIndex: number;
    startsAt: string;
    participants: number;
    ownerName: string | null;
    ownerRegNo: string | null;
  };
  checkedInAt?: string | null;
  opensAt?: string;
  closesAt?: string;
}

export type WaitlistStatus = "waiting" | "offered" | "accepted" | "expired" | "left";

export interface WaitlistEntryDto {
  id: string;
  facility: FacilityCode;
  resourceId: string;
  resource: string;
  date: string;
  slotIndex: number;
  startsAt: string;
  participants: number;
  status: WaitlistStatus;
  /** 1-based queue position while waiting. */
  position: number | null;
  offerExpiresAt: string | null;
  bookingId: string | null;
  createdAt: string;
}

export const checkOutSchema = z
  .object({
    rating: z.enum(["good", "issue"]),
    description: z.string().trim().max(1000).optional(),
  })
  .strict();

export const guardScanSchema = z.object({ code: z.string().max(200) }).strict();

export const joinWaitlistSchema = createBookingSchema;

// ---------------------------------------------------------------------------
// Sports administrator
// ---------------------------------------------------------------------------

export const BLOCK_REASONS = ["hpl", "maintenance", "event", "other"] as const;
export type BlockReason = (typeof BLOCK_REASONS)[number];
export const FEEDBACK_STATUSES = ["open", "in_progress", "resolved"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export interface FacilityAnalytics {
  facility: FacilityCode;
  bookings: number;
  attended: number;
  noShows: number;
  cancellations: number;
  playersAttended: number;
  slotCapacity: number;
}

export interface AnalyticsDto {
  from: string;
  to: string;
  byFacility: FacilityAnalytics[];
  daily: { date: string; bookings: number; attended: number }[];
  bySlot: { slotIndex: number; bookings: number; attended: number }[];
  /** weekday: 0 = Sunday. Only slots with attendance are listed. */
  heatmap: { weekday: number; slotIndex: number; attended: number }[];
}

export interface BlockDto {
  id: string;
  facility: FacilityCode;
  resourceId: string | null;
  resource: string | null;
  startDate: string;
  endDate: string;
  slotIndexes: number[] | null;
  reason: BlockReason;
  label: string;
  note: string | null;
  createdAt: string;
}

export interface BlockOverlapsDto {
  bookings: {
    id: string;
    resource: string;
    date: string;
    slotIndex: number;
    status: BookingStatus;
    participants: number;
    ownerName: string | null;
    ownerRegNo: string | null;
  }[];
  blocks: BlockDto[];
}

export interface AdminBookingDto extends BookingDto {
  ownerName: string | null;
  ownerRegNo: string | null;
  ownerEmail: string;
}

export interface FeedbackItemDto {
  id: string;
  facility: FacilityCode;
  resource: string | null;
  date: string;
  slotIndex: number | null;
  rating: "good" | "issue";
  description: string | null;
  status: FeedbackStatus;
  hasPhoto: boolean;
  createdAt: string;
  updatedAt: string;
  authorName: string | null;
  authorRegNo: string | null;
}

export interface StaffMemberDto {
  id: string;
  email: string;
  fullName: string | null;
  roles: string[];
}

const blockShape = {
  facility: z.enum(["pickleball", "tennis", "turf"]),
  resourceId: z.uuid().nullable().optional(),
  startDate: isoDate,
  endDate: isoDate,
  slotIndexes: z.array(z.number().int().min(1).max(12)).max(12).nullable().optional(),
};

export const blockPreviewSchema = z.object({ ...blockShape, excludeId: z.uuid().optional() }).strict();

export const saveBlockSchema = z
  .object({
    ...blockShape,
    reason: z.enum(BLOCK_REASONS),
    note: z.string().max(1000).optional(),
    cancelAffected: z.boolean().optional(),
  })
  .strict();

export const analyticsQuerySchema = z.object({ from: isoDate, to: isoDate }).strict();

export const adminBookingsQuerySchema = z
  .object({ date: isoDate, facility: z.enum(["pickleball", "tennis", "turf"]).optional() })
  .strict();

export const adminCancelSchema = z.object({ reason: z.string().trim().min(1).max(150) }).strict();

export const feedbackQuerySchema = z
  .object({
    status: z.enum(FEEDBACK_STATUSES).optional(),
    facility: z.enum(["pickleball", "tennis", "turf"]).optional(),
    rating: z.enum(["good", "issue"]).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict();

export const feedbackStatusSchema = z.object({ status: z.enum(FEEDBACK_STATUSES) }).strict();

export const staffRoleSchema = z
  .object({ email: z.string().trim().max(254), role: z.enum(["guard", "sports_admin"]), grant: z.boolean() })
  .strict();

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
