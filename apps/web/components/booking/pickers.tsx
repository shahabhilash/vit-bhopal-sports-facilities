"use client";
import { Check, Lock } from "lucide-react";
import type { DateOption, SlotState } from "@/lib/availability";
import { formatDayMonth, formatInstant, relativeDayLabel } from "@/lib/format";
import type { TimeSlot } from "@vitb/shared";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------------ */
/* Court / area                                                              */
/* ------------------------------------------------------------------------ */

export function CourtPicker({
  resources,
  value,
  onChange,
}: {
  resources: readonly string[];
  value: string;
  onChange: (resource: string) => void;
}) {
  return (
    <div role="radiogroup" aria-labelledby="court-label" className="grid grid-cols-2 gap-2 sm:max-w-sm">
      {resources.map((r) => {
        const selected = r === value;
        return (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(r)}
            className={cn(
              "flex h-12 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors",
              selected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-surface hover:bg-accent",
            )}
          >
            {selected && <Check className="h-4 w-4" aria-hidden />}
            {r}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Day strip                                                                 */
/* ------------------------------------------------------------------------ */

export function DateStrip({
  options,
  value,
  onChange,
  now,
}: {
  options: DateOption[];
  value: string;
  onChange: (date: string) => void;
  now: Date;
}) {
  return (
    <div
      role="radiogroup"
      aria-labelledby="day-label"
      className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
    >
      {options.map(({ date, opensAt }) => {
        const selected = date === value;
        const locked = opensAt !== null;
        const day = relativeDayLabel(date, now);
        const dayMonth = formatDayMonth(date);
        return (
          <button
            key={date}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={locked}
            aria-label={opensAt ? `${day} ${dayMonth}, opens ${formatInstant(opensAt)}` : `${day} ${dayMonth}`}
            onClick={() => onChange(date)}
            className={cn(
              "flex min-h-16 w-[4.75rem] shrink-0 snap-start flex-col items-center justify-center rounded-lg border px-1 text-center transition-colors",
              selected && "border-primary bg-primary text-primary-foreground",
              !selected && !locked && "border-input bg-surface hover:bg-accent",
              locked && "cursor-not-allowed border-dashed bg-surface-sunken text-muted-foreground",
            )}
          >
            <span className="text-xs font-semibold">{day}</span>
            <span className="text-sm font-bold">{dayMonth}</span>
            {locked && (
              <span className="mt-0.5 flex items-center gap-0.5 text-[11px] font-medium">
                <Lock className="h-3 w-3" aria-hidden />
                Fri 12 PM
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Time slots                                                                */
/* ------------------------------------------------------------------------ */

const STATE_TEXT: Record<SlotState["kind"], string> = {
  open: "Open",
  mine: "Your booking",
  booked: "Booked",
  blocked: "Unavailable",
  past: "Started",
  not_released: "Not open yet",
};

export function SlotGrid({
  slots,
  value,
  onChange,
}: {
  slots: { slot: TimeSlot; state: SlotState }[];
  value: number | null;
  onChange: (slotIndex: number) => void;
}) {
  return (
    <div role="radiogroup" aria-labelledby="time-label" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {slots.map(({ slot, state }) => {
        const selectable = state.kind === "open";
        const selected = selectable && slot.index === value;
        const start = slot.label.split(" – ")[0];
        const statusText =
          selected ? "Selected" : state.kind === "blocked" ? state.reason : STATE_TEXT[state.kind];
        return (
          <button
            key={slot.index}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={!selectable}
            aria-label={`${slot.label}, ${statusText}`}
            onClick={() => onChange(slot.index)}
            className={cn(
              "flex min-h-[3.75rem] flex-col items-start justify-center rounded-lg border px-3 py-2 text-left transition-colors",
              selected && "border-primary bg-primary text-primary-foreground",
              selectable && !selected && "border-input bg-surface hover:border-primary hover:bg-accent",
              state.kind === "mine" && "border-success/40 bg-success-soft",
              state.kind === "booked" && "border-transparent bg-surface-sunken text-muted-foreground line-through decoration-1",
              state.kind === "blocked" && "border-warning/40 bg-warning-soft",
              (state.kind === "past" || state.kind === "not_released") &&
                "border-transparent bg-surface-sunken text-muted-foreground",
              !selectable && "cursor-not-allowed",
            )}
          >
            <span className="text-sm font-bold">{start}</span>
            <span
              className={cn(
                "flex items-center gap-1 text-xs font-medium",
                selected ? "text-primary-foreground/90" : "text-muted-foreground",
                state.kind === "mine" && "text-success",
                state.kind === "blocked" && "text-warning",
              )}
            >
              {selected && <Check className="h-3.5 w-3.5" aria-hidden />}
              {statusText}
            </span>
          </button>
        );
      })}
    </div>
  );
}
