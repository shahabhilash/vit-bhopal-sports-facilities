export interface TimeSlot {
  /** 1-based position in the day; this is what the database stores. */
  index: number;
  /** 24-hour "HH:mm" in Asia/Kolkata. */
  start: string;
  end: string;
  label: string;
}

const SLOT_STARTS = [
  "08:30", "09:30", "10:30", "11:30", "12:30", "13:30",
  "14:30", "15:30", "16:30", "17:30", "18:30", "19:30",
] as const;

function addOneHour(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  return `${String(Number(h) + 1).padStart(2, "0")}:${m}`;
}

function to12Hour(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** The 12 one-hour slots used by pickleball, tennis and turf. Mirrors public.time_slots. */
export const TIME_SLOTS: readonly TimeSlot[] = SLOT_STARTS.map((start, i) => {
  const end = addOneHour(start);
  return { index: i + 1, start, end, label: `${to12Hour(start)} – ${to12Hour(end)}` };
});

export function getSlot(index: number): TimeSlot | undefined {
  return TIME_SLOTS.find((s) => s.index === index);
}
