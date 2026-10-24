import { FACILITY_RULES, type FacilityCode, type FacilityRule } from "@vitb/shared";

export interface FacilityInfo {
  code: FacilityCode;
  rule: FacilityRule;
  /** One line for cards. */
  summary: string;
  image: string;
  imageAlt: string;
  gallery: string[];
  rules: string[];
  equipment: string[];
}

export type BookableCode = "pickleball" | "tennis" | "turf";
export const BOOKABLE: readonly BookableCode[] = ["pickleball", "tennis", "turf"];

export const FACILITIES: Record<FacilityCode, FacilityInfo> = {
  pickleball: {
    code: "pickleball",
    rule: FACILITY_RULES.pickleball,
    summary: "Two courts, booked by the hour.",
    image: "/images/pickleball-2.jpg",
    imageAlt: "Pickleball court with blue playing surface and net",
    gallery: ["/images/pickleball-2.jpg", "/images/pickleball-1.jpg", "/images/pickleball-3.jpg", "/images/pickleball-4.jpg"],
    rules: ["Non-marking shoes only.", "2–10 players per court booking.", "Show your booking to the facility guard before playing."],
    equipment: ["Paddles available for rent.", "Balls available at the sports office."],
  },
  tennis: {
    code: "tennis",
    rule: FACILITY_RULES.tennis,
    summary: "Two hard courts, booked by the hour.",
    image: "/images/tennis-4.jpg",
    imageAlt: "Tennis court with net in daylight",
    gallery: ["/images/tennis-4.jpg", "/images/tennis-1.jpg", "/images/tennis-2.jpg", "/images/tennis-3.jpg"],
    rules: ["Proper tennis attire required.", "Non-marking shoes only.", "2–10 players per court booking."],
    equipment: ["Bring your own racquet.", "Balls available at the sports office."],
  },
  turf: {
    code: "turf",
    rule: FACILITY_RULES.turf,
    summary: "Full turf for groups of 10–26. Next week opens Friday 12:00 PM.",
    image: "/images/turf-1.jpg",
    imageAlt: "Floodlit rooftop artificial turf at dusk",
    gallery: ["/images/turf-1.jpg"],
    rules: [
      "Turf shoes or trainers only (no metal studs).",
      "No food or drinks on the turf.",
      "10–26 players. Every player's registration number is needed to book.",
    ],
    equipment: ["Goalposts available.", "Football available at the sports office."],
  },
  gym: {
    code: "gym",
    rule: FACILITY_RULES.gym,
    summary: "Not booked online. Access is arranged with FR Sports.",
    image: "/images/gym-1.jpg",
    imageAlt: "Treadmills in the campus gym",
    gallery: [
      "/images/gym-3.jpg", "/images/gym-2.jpg", "/images/gym-4.jpg", "/images/gym-5.jpg",
      "/images/gym-6.jpg", "/images/gym-8.jpg", "/images/gym-9.jpg", "/images/gym-7.jpg",
    ],
    rules: ["Towel mandatory.", "Wipe down machines after use.", "Indoor shoes only."],
    equipment: ["Free weights", "Cardio machines", "Resistance machines", "Yoga mats"],
  },
  recreation: {
    code: "recreation",
    rule: FACILITY_RULES.recreation,
    summary: "Walk-in play in blocks 1–8. No booking needed.",
    image: "",
    imageAlt: "",
    gallery: [],
    rules: [],
    equipment: [],
  },
};

export function isBookable(code: string | null | undefined): code is BookableCode {
  return (BOOKABLE as readonly string[]).includes(code ?? "");
}

export function participantRange(code: BookableCode): { min: number; max: number } {
  const { minParticipants, maxParticipants } = FACILITIES[code].rule;
  return { min: minParticipants ?? 1, max: maxParticipants ?? 1 };
}
