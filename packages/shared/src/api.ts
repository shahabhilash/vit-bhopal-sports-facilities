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
