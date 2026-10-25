"use client";
import { useState } from "react";
import { BellRing, Hourglass } from "lucide-react";
import type { WaitlistEntryDto } from "@vitb/shared";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { toast } from "@/components/ui/toaster";
import { errorMessage } from "@/lib/api";
import { acceptOffer, leaveWaitlist } from "@/lib/bookings";
import { FACILITIES } from "@/lib/catalog";
import { formatLongDate, formatTime, slotLabel } from "@/lib/format";

const describe = (e: WaitlistEntryDto) =>
  `${FACILITIES[e.facility].rule.name} · ${e.resource}, ${formatLongDate(e.date)}, ${slotLabel(e.slotIndex)}`;

/** Live offers (with accept/decline) and waiting entries. Renders nothing when empty. */
export function WaitlistPanel({ entries, now }: { entries: WaitlistEntryDto[]; now: Date }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const offers = entries.filter((e) => e.status === "offered" && e.offerExpiresAt && new Date(e.offerExpiresAt) > now);
  const waiting = entries.filter((e) => e.status === "waiting");
  if (offers.length === 0 && waiting.length === 0) return null;

  async function run(id: string, action: () => Promise<unknown>, success: string) {
    setBusy(id);
    setError(null);
    try {
      await action();
      toast("success", success);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="waitlist-title" className="mb-6 space-y-3">
      <h2 id="waitlist-title" className="text-base font-semibold">
        Waiting list
      </h2>
      {error && (
        <Notice tone="danger" live>
          {error}
        </Notice>
      )}
      {offers.map((e) => {
        const minutes = Math.max(0, Math.ceil((new Date(e.offerExpiresAt!).getTime() - now.getTime()) / 60_000));
        return (
          <article key={e.id} className="rounded-xl border-2 border-primary bg-brand-soft/50 p-4 shadow-card" aria-live="polite">
            <p className="flex items-center gap-2 font-semibold">
              <BellRing className="h-5 w-5 text-primary" aria-hidden />
              A slot opened up for you
            </p>
            <p className="mt-1 text-sm">{describe(e)}</p>
            <p className="mt-1 text-sm font-semibold">
              Accept by {formatTime(new Date(e.offerExpiresAt!))} ({minutes} min left), or it goes to the next person.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button size="lg" disabled={busy !== null} onClick={() => run(e.id, () => acceptOffer(e.id), "Booked! It's in your upcoming bookings.")}>
                {busy === e.id ? "Booking…" : "Accept and book"}
              </Button>
              <Button variant="outline" size="lg" disabled={busy !== null} onClick={() => run(e.id, () => leaveWaitlist(e.id), "Offer declined")}>
                Decline
              </Button>
            </div>
          </article>
        );
      })}
      {waiting.length > 0 && (
        <ul className="divide-y rounded-xl border bg-card shadow-card">
          {waiting.map((e) => (
            <li key={e.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="text-sm">
                  <p className="font-semibold">{describe(e)}</p>
                  <p className="text-muted-foreground">Position {e.position} in line</p>
                </div>
              </div>
              <Button variant="ghost" disabled={busy !== null} onClick={() => run(e.id, () => leaveWaitlist(e.id), "Left the waiting list")}>
                {busy === e.id ? "Leaving…" : "Leave"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
