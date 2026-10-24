export const FACILITY_CODES = ["pickleball", "tennis", "turf", "gym", "recreation"] as const;
export type FacilityCode = (typeof FACILITY_CODES)[number];

export type ReleaseRule = "rolling" | "weekly_friday_noon";

export interface FacilityRule {
  code: FacilityCode;
  name: string;
  bookable: boolean;
  minParticipants: number | null;
  maxParticipants: number | null;
  /** Rolling horizon in days including today; null for weekly release or non-bookable. */
  bookingHorizonDays: number | null;
  releaseRule: ReleaseRule | null;
  resources: readonly string[];
}

/**
 * Facility configuration. Mirrors the seed rows in the database migration;
 * supabase/tests checks that both stay identical.
 */
export const FACILITY_RULES: Readonly<Record<FacilityCode, FacilityRule>> = {
  pickleball: {
    code: "pickleball",
    name: "Pickleball",
    bookable: true,
    minParticipants: 2,
    maxParticipants: 10,
    bookingHorizonDays: 7,
    releaseRule: "rolling",
    resources: ["Court 1", "Court 2"],
  },
  tennis: {
    code: "tennis",
    name: "Tennis",
    bookable: true,
    minParticipants: 2,
    maxParticipants: 10,
    bookingHorizonDays: 7,
    releaseRule: "rolling",
    resources: ["Court 1", "Court 2"],
  },
  turf: {
    code: "turf",
    name: "Turf",
    bookable: true,
    minParticipants: 10,
    maxParticipants: 26,
    bookingHorizonDays: null,
    releaseRule: "weekly_friday_noon",
    resources: ["Full turf"],
  },
  gym: {
    code: "gym",
    name: "Gym",
    bookable: false,
    minParticipants: null,
    maxParticipants: null,
    bookingHorizonDays: null,
    releaseRule: null,
    resources: [],
  },
  recreation: {
    code: "recreation",
    name: "Recreation rooms",
    bookable: false,
    minParticipants: null,
    maxParticipants: null,
    bookingHorizonDays: null,
    releaseRule: null,
    resources: [],
  },
};
