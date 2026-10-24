import { describe, expect, it } from "vitest";
import {
  TIME_SLOTS,
  isAllowedEmail,
  istDateString,
  isIsoDate,
  isValidRegNo,
  normalizeEmail,
  normalizeRegNo,
  slotStartInstant,
  turfReleaseInstant,
} from "./index";

describe("email domain rule", () => {
  it.each([
    "student@vitbhopal.ac.in",
    "  Name.23BCE10001@VITBHOPAL.AC.IN ",
    "fr.sports@vitbhopal.ac.in",
  ])("accepts %j", (email) => {
    expect(isAllowedEmail(email)).toBe(true);
  });

  it.each([
    "student@vitbhopal.ac.in.example.com",
    "student@sub.vitbhopal.ac.in",
    "student@evilvitbhopal.ac.in",
    "student@vitbhopal-ac.in",
    "student@vitbhopalxac.in",
    "student@vitbhopal.ac.in@gmail.com",
    "@vitbhopal.ac.in",
    "student@gmail.com",
    "stu dent@vitbhopal.ac.in",
    "student@vitbhopal.ac.in\u0000",
    "",
  ])("rejects %j", (email) => {
    expect(isAllowedEmail(email)).toBe(false);
  });

  it("normalizes case and whitespace", () => {
    expect(normalizeEmail("  A@VITBHOPAL.AC.IN ")).toBe("a@vitbhopal.ac.in");
  });
});

describe("time slots", () => {
  it("has the 12 required slots from 8:30 AM to 8:30 PM", () => {
    expect(TIME_SLOTS).toHaveLength(12);
    expect(TIME_SLOTS[0]).toMatchObject({ index: 1, start: "08:30", end: "09:30", label: "8:30 AM – 9:30 AM" });
    expect(TIME_SLOTS[4]?.label).toBe("12:30 PM – 1:30 PM");
    expect(TIME_SLOTS[11]).toMatchObject({ index: 12, start: "19:30", end: "20:30", label: "7:30 PM – 8:30 PM" });
  });

  it("anchors slot instants to IST", () => {
    expect(slotStartInstant("2026-10-26", 1).toISOString()).toBe("2026-10-26T03:00:00.000Z");
    expect(() => slotStartInstant("2026-10-26", 13)).toThrow(RangeError);
  });
});

describe("IST dates", () => {
  it("uses the IST calendar date, not UTC", () => {
    // 2026-10-25 20:00 UTC is 2026-10-26 01:30 IST.
    expect(istDateString(new Date("2026-10-25T20:00:00Z"))).toBe("2026-10-26");
    expect(istDateString(new Date("2026-10-25T18:29:59Z"))).toBe("2026-10-25");
  });

  it("validates calendar dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("26-02-01")).toBe(false);
  });
});

describe("turf weekly release", () => {
  // 2026-10-30 is a Friday; the week it releases is Sat 31 Oct → Fri 6 Nov.
  const releaseUtc = "2026-10-30T06:30:00.000Z";

  it.each(["2026-10-31", "2026-11-01", "2026-11-04", "2026-11-06"])(
    "%s is released on Friday 30 Oct at 12:00 IST",
    (date) => {
      expect(turfReleaseInstant(date).toISOString()).toBe(releaseUtc);
    },
  );

  it("a Friday belongs to the week released the previous Friday", () => {
    expect(turfReleaseInstant("2026-10-30").toISOString()).toBe("2026-10-23T06:30:00.000Z");
  });

  it("the next Saturday is released a week later", () => {
    expect(turfReleaseInstant("2026-11-07").toISOString()).toBe("2026-11-06T06:30:00.000Z");
  });
});

describe("registration numbers", () => {
  it("normalizes and validates", () => {
    expect(normalizeRegNo(" 23bce 10001 ")).toBe("23BCE10001");
    expect(isValidRegNo("23bce10001")).toBe(true);
    expect(isValidRegNo("22MIM1012")).toBe(true);
    expect(isValidRegNo("23BCE")).toBe(false);
    expect(isValidRegNo("23BCE10001X")).toBe(false);
    expect(isValidRegNo("ABBCE10001")).toBe(false);
  });
});
