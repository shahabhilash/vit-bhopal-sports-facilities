"use client";
import { useState } from "react";
import Link from "next/link";
import { CalendarPlus, LogOut, QrCode, RefreshCw } from "lucide-react";
import { istDateString } from "@vitb/shared";
import { BookingCard } from "@/components/booking/booking-card";
import { CheckoutDialog } from "@/components/booking/checkout-dialog";
import { PassDialog } from "@/components/booking/pass-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState, Notice, PageHeader, Skeleton } from "@/components/ui/feedback";
import { errorMessage } from "@/lib/api";
import { useMyBookings, type Booking } from "@/lib/bookings";
import { formatLongDate, formatTime } from "@/lib/format";
import { useSessionStatus } from "@/lib/supabase/session";
import { useNow } from "@/lib/use-now";

const MINUTE = 60_000;
// Decision Q8: check-in opens 10 minutes before the start and closes 15 minutes after.
const OPENS_BEFORE = 10 * MINUTE;
const CLOSES_AFTER = 15 * MINUTE;

function windowText(b: Booking, now: Date) {
  const start = new Date(b.startsAt).getTime();
  if (b.status === "checked_in") return <p className="text-sm font-semibold text-success">Checked in. Enjoy your game.</p>;
  if (b.status === "completed") return <p className="text-sm text-muted-foreground">Session complete.</p>;
  if (b.status === "no_show") {
    return <p className="text-sm font-medium text-destructive">Not checked in within 15 minutes; the slot was released.</p>;
  }
  if (now.getTime() < start - OPENS_BEFORE) {
    return <p className="text-sm text-muted-foreground">Check-in opens at {formatTime(new Date(start - OPENS_BEFORE))}.</p>;
  }
  if (now.getTime() <= start + CLOSES_AFTER) {
    return (
      <p className="text-sm font-semibold">
        Check-in is open until {formatTime(new Date(start + CLOSES_AFTER))}. Go to the guard at the facility.
      </p>
    );
  }
  return <p className="text-sm text-muted-foreground">Check-in closed at {formatTime(new Date(start + CLOSES_AFTER))}.</p>;
}

export default function CheckInPage() {
  const session = useSessionStatus();
  const { data: bookings, error, loading, refresh } = useMyBookings(session);
  const now = useNow();
  const [showPass, setShowPass] = useState<Booking | null>(null);
  const [checkingOut, setCheckingOut] = useState<Booking | null>(null);

  const actions = (b: Booking, at: Date) => (
    <div className="flex w-full flex-col gap-3">
      {windowText(b, at)}
      <div className="flex flex-col gap-2 sm:flex-row">
        {b.status === "confirmed" && new Date(b.startsAt).getTime() + CLOSES_AFTER >= at.getTime() && (
          <Button size="lg" onClick={() => setShowPass(b)}>
            <QrCode aria-hidden />
            Show pass
          </Button>
        )}
        {b.status === "checked_in" && b.isOwner && (
          <Button size="lg" variant="outline" onClick={() => setCheckingOut(b)}>
            <LogOut aria-hidden />
            Check out
          </Button>
        )}
      </div>
    </div>
  );

  const today = now ? istDateString(now) : null;
  const todays = (bookings ?? [])
    .filter((b) => b.date === today && b.status !== "cancelled")
    .sort((a, b) => a.slotIndex - b.slotIndex);

  return (
    <div className="container max-w-3xl py-6 sm:py-10">
      <PageHeader title="Check in" description={today ? formatLongDate(today) : undefined} />
      <Notice tone="info" title="How check-in works">
        Open your pass and show it to the facility guard, from 10 minutes before the start. If nobody checks in within 15
        minutes of the start, the slot is released to other students.
      </Notice>

      <div className="mt-6">
        {session === "unconfigured" ? (
          <Notice tone="warning">This environment is not connected to the booking service.</Notice>
        ) : error ? (
          <Notice tone="danger" title="Could not load today's bookings">
            <p>{errorMessage(error)}</p>
            <Button variant="outline" className="mt-2" onClick={() => void refresh()}>
              <RefreshCw aria-hidden />
              Try again
            </Button>
          </Notice>
        ) : !now || loading ? (
          <Skeleton className="h-40 w-full" />
        ) : todays.length === 0 ? (
          <EmptyState
            icon={CalendarPlus}
            title="No bookings today"
            description="Today's bookings appear here with their check-in times."
            action={
              <Link href="/book" className={buttonVariants({ size: "lg" })}>
                Book a slot
              </Link>
            }
          />
        ) : (
          <ul className="space-y-3">
            {todays.map((b) => (
              <li key={b.id}>
                <BookingCard booking={b} actions={actions(b, now)} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <PassDialog booking={showPass} onClose={() => setShowPass(null)} />
      <CheckoutDialog booking={checkingOut} onClose={() => setCheckingOut(null)} />
    </div>
  );
}
