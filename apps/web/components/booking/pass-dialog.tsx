"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Sun } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Notice, Skeleton } from "@/components/ui/feedback";
import { errorMessage } from "@/lib/api";
import { getPass, type Booking } from "@/lib/bookings";
import { FACILITIES } from "@/lib/catalog";
import { formatLongDate, slotLabel } from "@/lib/format";

/** Booking pass: a QR code the facility guard scans to check the group in. */
export function PassDialog({ booking, onClose }: { booking: Booking | null; onClose: () => void }) {
  const [qr, setQr] = useState<{ id: string; src: string } | null>(null);
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    if (!booking) return;
    let cancelled = false;
    getPass(booking.id)
      .then(({ code }) => QRCode.toDataURL(code, { errorCorrectionLevel: "M", margin: 2, width: 320 }))
      .then((src) => !cancelled && setQr({ id: booking.id, src }))
      .catch((err: unknown) => !cancelled && setFailure({ id: booking.id, message: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [booking]);

  const src = booking && qr?.id === booking.id ? qr.src : null;
  const error = booking && failure?.id === booking.id ? failure.message : null;

  return (
    <Dialog open={booking !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Booking pass</DialogTitle>
          {booking && (
            <DialogDescription>
              {FACILITIES[booking.facility].rule.name} · {booking.resource}, {formatLongDate(booking.date)},{" "}
              {slotLabel(booking.slotIndex)}
            </DialogDescription>
          )}
        </DialogHeader>
        {error ? (
          <Notice tone="danger" live>
            {error}
          </Notice>
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element -- generated data URL, nothing to optimise
          <img
            src={src}
            alt="QR code for this booking. Show it to the facility guard."
            className="mx-auto aspect-square w-full max-w-[18rem] rounded-lg border bg-white"
          />
        ) : (
          <Skeleton className="mx-auto aspect-square w-full max-w-[18rem]" />
        )}
        <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
          <Sun className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Show this to the guard at the facility. Turn your screen brightness up. One scan checks in the whole group.
        </p>
      </DialogContent>
    </Dialog>
  );
}
