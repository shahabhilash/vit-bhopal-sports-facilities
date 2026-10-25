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
