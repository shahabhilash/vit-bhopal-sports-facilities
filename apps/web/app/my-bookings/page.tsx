"use client";
import { useState } from "react";
import Link from "next/link";
import { BarChart3, CalendarPlus, CalendarX2, History, RefreshCw } from "lucide-react";
import { BookingCard } from "@/components/booking/booking-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Notice, PageHeader, Skeleton } from "@/components/ui/feedback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { errorMessage } from "@/lib/api";
import { cancelBooking, isActive, useMyBookings, type Booking } from "@/lib/bookings";
import { FACILITIES } from "@/lib/catalog";
import { formatLongDate, slotLabel } from "@/lib/format";
import { useSessionStatus } from "@/lib/supabase/session";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

const HOUR_MS = 60 * 60 * 1000;
const byStart = (a: Booking, b: Booking) => a.startsAt.localeCompare(b.startsAt);

export default function MyBookingsPage() {
  const session = useSessionStatus();
  const { data: bookings, error, loading, refresh } = useMyBookings(session);
  const now = useNow();
  const [toCancel, setToCancel] = useState<Booking | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const header = (
    <PageHeader
      title="My bookings"
      actions={
        <Link href="/report" className={cn(buttonVariants({ variant: "outline" }))}>
          <BarChart3 aria-hidden />
          Activity
        </Link>
      }
    />
  );

  if (session === "unconfigured") {
    return (
      <div className="container max-w-3xl py-6 sm:py-10">
        {header}
        <Notice tone="warning" title="Bookings are not available here yet">
          This environment is not connected to the booking service.
        </Notice>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container max-w-3xl py-6 sm:py-10">
        {header}
        <Notice tone="danger" title="Could not load your bookings">
          <p>{errorMessage(error)}</p>
          <Button variant="outline" className="mt-2" onClick={() => void refresh()}>
            <RefreshCw aria-hidden />
            Try again
          </Button>
        </Notice>
      </div>
    );
  }

  if (!now || loading || !bookings) {
    return (
      <div className="container max-w-3xl py-6 sm:py-10" aria-busy="true">
        {header}
        <Skeleton className="h-11 w-full" />
        <Skeleton className="mt-4 h-36 w-full" />
        <Skeleton className="mt-3 h-36 w-full" />
      </div>
    );
  }

  const ended = (b: Booking) => new Date(b.startsAt).getTime() + HOUR_MS <= now.getTime();
  const upcoming = bookings.filter((b) => isActive(b) && !ended(b)).sort(byStart);
  const past = bookings
    .filter((b) => b.status === "completed" || b.status === "no_show" || (isActive(b) && ended(b)))
    .sort((a, b) => byStart(b, a));
  const cancelled = bookings.filter((b) => b.status === "cancelled").sort((a, b) => byStart(b, a));

  const canCancel = (b: Booking) =>
    b.isOwner && b.status === "confirmed" && new Date(b.startsAt).getTime() - now.getTime() > HOUR_MS;

  async function confirmCancel() {
    if (!toCancel) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await cancelBooking(toCancel.id);
      toast("success", "Booking cancelled", `${FACILITIES[toCancel.facility].rule.name}, ${slotLabel(toCancel.slotIndex)}`);
      setToCancel(null);
    } catch (err) {
      setCancelError(errorMessage(err));
    } finally {
      setCancelling(false);
    }
  }

  const list = (items: Booking[], empty: React.ReactNode, withActions = false) =>
    items.length === 0 ? (
      empty
    ) : (
      <ul className="space-y-3">
        {items.map((b) => (
          <li key={b.id}>
            <BookingCard
              booking={b}
              actions={
                withActions &&
                b.isOwner &&
                b.status === "confirmed" &&
                (canCancel(b) ? (
                  <Button variant="outline" className="text-destructive" onClick={() => setToCancel(b)}>
                    Cancel booking
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">Cancellation closed 1 hour before the start.</p>
                ))
              }
            />
          </li>
        ))}
      </ul>
    );

  return (
    <div className="container max-w-3xl py-6 sm:py-10">
      {header}
      <Tabs defaultValue="upcoming">
        <TabsList aria-label="Booking lists">
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming">
          {list(
            upcoming,
            <EmptyState
              icon={CalendarPlus}
              title="No upcoming bookings"
              description="Pick a sport, day and time to book."
              action={
                <Link href="/book" className={buttonVariants({ size: "lg" })}>
                  Book a slot
                </Link>
              }
            />,
            true,
          )}
        </TabsContent>
        <TabsContent value="past">{list(past, <EmptyState icon={History} title="No past bookings yet" />)}</TabsContent>
        <TabsContent value="cancelled">{list(cancelled, <EmptyState icon={CalendarX2} title="No cancelled bookings" />)}</TabsContent>
      </Tabs>

      <Dialog
        open={toCancel !== null}
        onOpenChange={(open) => {
          if (!open && !cancelling) {
            setToCancel(null);
            setCancelError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this booking?</DialogTitle>
            <DialogDescription>
              {toCancel &&
                `${FACILITIES[toCancel.facility].rule.name} · ${toCancel.resource}, ${formatLongDate(toCancel.date)}, ${slotLabel(toCancel.slotIndex)}.`}{" "}
              The slot is released to other students. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {cancelError && (
            <Notice tone="danger" live>
              {cancelError}
            </Notice>
          )}
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => setToCancel(null)} disabled={cancelling}>
              Keep booking
            </Button>
            <Button variant="destructive" size="lg" onClick={confirmCancel} disabled={cancelling}>
              {cancelling ? "Cancelling…" : "Cancel booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
