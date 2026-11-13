"use client";
import { useEffect, useState } from "react";
import { CalendarX2, RefreshCw } from "lucide-react";
import { addDays, istDateString, type GuardBookingDto } from "@vitb/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice, Skeleton } from "@/components/ui/feedback";
import { errorMessage } from "@/lib/api";
import { useGuardBookings } from "@/lib/bookings";
import { BOOKABLE, FACILITIES, type BookableCode } from "@/lib/catalog";
import { formatDayMonth, formatTime, relativeDayLabel, slotLabel } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

const STATUS: Record<GuardBookingDto["status"], { label: string; tone: "brand" | "success" | "neutral" | "danger" }> = {
  confirmed: { label: "Not checked in", tone: "brand" },
  checked_in: { label: "Checked in", tone: "success" },
  completed: { label: "Finished", tone: "neutral" },
  no_show: { label: "Missed", tone: "danger" },
};

/** Numbered registration numbers, with the booker's in bold. */
export function PlayerRegList({ regNos, ownerRegNo }: { regNos: string[]; ownerRegNo: string | null }) {
  return (
    <ol className="grid grid-cols-1 gap-x-4 gap-y-1 font-mono text-base min-[380px]:grid-cols-2">
      {regNos.map((reg, i) => (
        <li key={reg} className="flex gap-2">
          <span className="w-6 shrink-0 text-right text-muted-foreground">{i + 1}.</span>
          <span className={cn(reg === ownerRegNo && "font-bold")}>{reg}</span>
        </li>
      ))}
    </ol>
  );
}

function BookingRow({ b }: { b: GuardBookingDto }) {
  const status = STATUS[b.status];
  const players = b.playerRegNos.length > 0 ? b.playerRegNos : b.ownerRegNo ? [b.ownerRegNo] : [];
  return (
    <article className="rounded-xl border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-semibold">
          {FACILITIES[b.facility].rule.name}
          {FACILITIES[b.facility].rule.resources.length > 1 && <span className="font-normal text-muted-foreground"> · {b.resource}</span>}
        </h4>
        <Badge tone={status.tone}>
          {status.label}
          {b.status === "checked_in" && b.checkedInAt ? ` ${formatTime(new Date(b.checkedInAt))}` : ""}
        </Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Booked by {b.ownerName ?? "name not set"}
        {b.ownerRegNo && <span className="font-mono"> · {b.ownerRegNo}</span>} · {b.participants} player
        {b.participants === 1 ? "" : "s"}
      </p>
      {players.length > 0 && (
        <div className="mt-3">
          <PlayerRegList regNos={players} ownerRegNo={b.ownerRegNo} />
          {b.playerRegNos.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">Booked before player lists were kept; only the booker is known.</p>
          )}
        </div>
      )}
    </article>
  );
}

/** The guard's list of a day's bookings, by time slot, for today and the next 6 days. */
export function GuardBookings() {
  const now = useNow();
  const today = now ? istDateString(now) : null;
  const [picked, setPicked] = useState<string | null>(null);
  const [sport, setSport] = useState<BookableCode | "all">("all");
  const date = picked ?? today;
  const { data, error, loading, refreshing, refresh } = useGuardBookings(date);

  // Keep the list current while the guard leaves it open.
  useEffect(() => {
    const timer = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const days = today ? Array.from({ length: 7 }, (_, i) => addDays(today, i)) : [];
  const rows = (data ?? []).filter((b) => sport === "all" || b.facility === sport);
  const slots = [...new Set(rows.map((b) => b.slotIndex))].sort((a, b) => a - b);
  const order = (b: GuardBookingDto) => BOOKABLE.indexOf(b.facility as BookableCode);

  return (
    <div className="space-y-4">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Day">
        {days.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={d === date}
            onClick={() => setPicked(d)}
            className={cn(
              "flex min-w-[4.5rem] shrink-0 flex-col items-center rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
              d === date ? "border-primary bg-primary text-primary-foreground" : "bg-surface hover:bg-accent",
            )}
          >
            <span>{relativeDayLabel(d, now ?? undefined)}</span>
            <span className="text-xs font-normal">{formatDayMonth(d)}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Sport">
        {(["all", ...BOOKABLE] as const).map((code) => (
          <button
            key={code}
            type="button"
            aria-pressed={sport === code}
            onClick={() => setSport(code)}
            className={cn(
              "h-9 rounded-full border px-4 text-sm font-semibold transition-colors",
              sport === code ? "border-primary bg-brand-soft text-foreground" : "bg-surface text-muted-foreground hover:bg-accent",
            )}
          >
            {code === "all" ? "All" : FACILITIES[code].rule.name}
          </button>
        ))}
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void refresh()} disabled={refreshing}>
          <RefreshCw className={cn(refreshing && "animate-spin")} aria-hidden />
          Refresh
        </Button>
      </div>

      {error ? (
        <Notice tone="danger" title="Could not load the bookings">
          {errorMessage(error)}
        </Notice>
      ) : loading || !date ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : slots.length === 0 ? (
        <EmptyState
          icon={CalendarX2}
          title="No bookings"
          description={`Nothing is booked${sport === "all" ? "" : ` for ${FACILITIES[sport].rule.name.toLowerCase()}`} on this day.`}
        />
      ) : (
        <div className="space-y-6">
          {slots.map((slot) => (
            <section key={slot} aria-label={slotLabel(slot)}>
              <h3 className="mb-2 text-base font-bold">{slotLabel(slot)}</h3>
              <div className="space-y-3">
                {rows
                  .filter((b) => b.slotIndex === slot)
                  .sort((a, b) => order(a) - order(b) || a.resource.localeCompare(b.resource))
                  .map((b) => (
                    <BookingRow key={`${b.facility}:${b.resource}:${b.slotIndex}`} b={b} />
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
