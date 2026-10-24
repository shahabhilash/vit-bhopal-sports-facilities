"use client";
import { useState } from "react";
import Link from "next/link";
import { BarChart3, CalendarPlus, CalendarX2, History } from "lucide-react";
import { slotStartInstant } from "@vitb/shared";
import { BookingCard } from "@/components/booking/booking-card";
import { PrototypeNotice } from "@/components/prototype-notice";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/feedback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { cancelBooking, isActive, useBookings, type Booking } from "@/lib/bookings";
import { FACILITIES } from "@/lib/catalog";
import { formatLongDate, slotLabel } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

const HOUR_MS = 60 * 60 * 1000;
const byStart = (a: Booking, b: Booking) => a.date.localeCompare(b.date) || a.slotIndex - b.slotIndex;

export default function MyBookingsPage() {
  const bookings = useBookings();
  const now = useNow();
  const [toCancel, setToCancel] = useState<Booking | null>(null);

  if (!now) {
    return (
      <div className="container max-w-3xl py-6 sm:py-10">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="mt-6 h-11 w-full" />
        <Skeleton className="mt-4 h-36 w-full" />
      </div>
    );
  }

  const ended = (b: Booking) => slotStartInstant(b.date, b.slotIndex).getTime() + HOUR_MS <= now.getTime();
  const upcoming = bookings.filter((b) => isActive(b) && !ended(b)).sort(byStart);
  const past = bookings.filter((b) => b.status === "completed" || (isActive(b) && ended(b))).sort((a, b) => byStart(b, a));
  const cancelled = bookings.filter((b) => b.status === "cancelled").sort((a, b) => byStart(b, a));

  const canCancel = (b: Booking) =>
    b.status === "confirmed" && slotStartInstant(b.date, b.slotIndex).getTime() - now.getTime() > HOUR_MS;

  function confirmCancel() {
    if (!toCancel) return;
    cancelBooking(toCancel.id);
    toast("success", "Booking cancelled", `${FACILITIES[toCancel.facility].rule.name}, ${slotLabel(toCancel.slotIndex)}`);
    setToCancel(null);
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
      <PageHeader
        title="My bookings"
        actions={
          <Link href="/report" className={cn(buttonVariants({ variant: "outline" }))}>
            <BarChart3 aria-hidden />
            Activity
          </Link>
        }
      />
      <PrototypeNotice />

      <Tabs defaultValue="upcoming" className="mt-6">
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
        <TabsContent value="past">
          {list(past, <EmptyState icon={History} title="No past bookings yet" />)}
        </TabsContent>
        <TabsContent value="cancelled">
          {list(cancelled, <EmptyState icon={CalendarX2} title="No cancelled bookings" />)}
        </TabsContent>
      </Tabs>

      <Dialog open={toCancel !== null} onOpenChange={(open) => !open && setToCancel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this booking?</DialogTitle>
            <DialogDescription>
              {toCancel &&
                `${FACILITIES[toCancel.facility].rule.name} · ${toCancel.resource}, ${formatLongDate(toCancel.date)}, ${slotLabel(toCancel.slotIndex)}.`}{" "}
              The slot is released to other students. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => setToCancel(null)}>
              Keep booking
            </Button>
            <Button variant="destructive" size="lg" onClick={confirmCancel}>
              Cancel booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
