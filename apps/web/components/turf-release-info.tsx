"use client";
import { CalendarClock } from "lucide-react";
import { turfWindow } from "@/lib/availability";
import { formatDayMonth, formatInstant } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

/** Turf booking window, computed from the Friday-noon release rule. */
export function TurfReleaseInfo({ className }: { className?: string }) {
  const now = useNow();
  if (!now) {
    return <p className={cn("text-sm text-muted-foreground", className)}>Next week opens Friday 12:00 PM.</p>;
  }
  const w = turfWindow(now);
  return (
    <p className={cn("flex gap-2 text-sm text-muted-foreground", className)}>
      <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span>
        {w.openThrough ? <>Open through {formatDayMonth(w.openThrough)}. </> : null}
        Next week ({formatDayMonth(w.nextWeekStart)} – {formatDayMonth(w.nextWeekEnd)}) opens{" "}
        <span className="font-semibold text-foreground">{formatInstant(w.nextRelease)}</span>.
      </span>
    </p>
  );
}
