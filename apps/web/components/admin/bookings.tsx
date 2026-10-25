"use client";
import { useState } from "react";
import { CalendarSearch } from "lucide-react";
import { istDateString, type AdminBookingDto } from "@vitb/shared";
import { StatusBadge } from "@/components/booking/booking-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Notice, Skeleton } from "@/components/ui/feedback";
import { FieldHint, Input, Label } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { errorMessage } from "@/lib/api";
import { adminCancelBooking, useAdminBookings } from "@/lib/admin";
import { BOOKABLE, FACILITIES } from "@/lib/catalog";
import { formatLongDate, slotLabel } from "@/lib/format";

export function AdminBookings() {
  const [date, setDate] = useState(istDateString());
  const [facility, setFacility] = useState("");
  const { data, error, loading } = useAdminBookings(date, facility);
  const [toCancel, setToCancel] = useState<AdminBookingDto | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function cancel() {
    if (!toCancel) return;
    setBusy(true);
    setCancelError(null);
    try {
      await adminCancelBooking(toCancel.id, reason.trim());
      toast("success", "Booking cancelled", "The student sees your reason in My bookings.");
      setToCancel(null);
      setReason("");
    } catch (err) {
      setCancelError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[12rem_14rem]">
        <div className="space-y-1">
          <Label htmlFor="ab-date">Date</Label>
          <Input id="ab-date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ab-facility">Facility</Label>
          <select
            id="ab-facility"
            value={facility}
            onChange={(e) => setFacility(e.target.value)}
            className="h-12 w-full rounded-lg border border-input bg-surface px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">All facilities</option>
            {BOOKABLE.map((c) => (
              <option key={c} value={c}>
                {FACILITIES[c].rule.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <Notice tone="danger">{errorMessage(error)}</Notice>
      ) : loading || !data ? (
        <Skeleton className="h-40" />
      ) : data.length === 0 ? (
        <EmptyState icon={CalendarSearch} title={`No bookings on ${formatLongDate(date)}`} />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-card">
          {data.map((b) => (
            <li key={b.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-0.5 text-sm">
                <p className="font-semibold">
                  {slotLabel(b.slotIndex)} · {FACILITIES[b.facility].rule.name} {b.resource}
                </p>
                <p>
                  {b.ownerName ?? "Name not set"} {b.ownerRegNo && <span className="font-mono">({b.ownerRegNo})</span>} ·{" "}
                  <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${b.ownerEmail}`}>
                    {b.ownerEmail}
                  </a>
                </p>
                <p className="text-muted-foreground">
                  {b.participants} players{b.cancelReason ? ` · ${b.cancelReason}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={b.status} />
                {b.status === "confirmed" && (
                  <Button variant="outline" className="text-destructive" onClick={() => setToCancel(b)}>
                    Cancel
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={toCancel !== null} onOpenChange={(open) => !open && !busy && setToCancel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this booking?</DialogTitle>
            <DialogDescription>
              {toCancel && `${toCancel.ownerName ?? "The student"}, ${slotLabel(toCancel.slotIndex)}, ${toCancel.resource}.`} The
              student sees your reason. If it is at least 2 hours away, the slot is offered to the waiting list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="ab-reason">Reason</Label>
            <Input id="ab-reason" maxLength={150} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Court surface repair" />
            <FieldHint>Shown as &ldquo;Cancelled by the sports office: …&rdquo;</FieldHint>
          </div>
          {cancelError && (
            <Notice tone="danger" live className="mt-3">
              {cancelError}
            </Notice>
          )}
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => setToCancel(null)} disabled={busy}>
              Keep booking
            </Button>
            <Button variant="destructive" size="lg" onClick={cancel} disabled={busy || !reason.trim()}>
              {busy ? "Cancelling…" : "Cancel booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
