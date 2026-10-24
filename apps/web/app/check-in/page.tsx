"use client";
import { useState } from "react";
import Link from "next/link";
import { CalendarPlus, ImagePlus, ThumbsUp, TriangleAlert, X } from "lucide-react";
import { istDateString, slotStartInstant } from "@vitb/shared";
import { BookingCard } from "@/components/booking/booking-card";
import { PrototypeNotice } from "@/components/prototype-notice";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/feedback";
import { FieldError, FieldHint, Label, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { checkIn, checkOut, useBookings, type Booking } from "@/lib/bookings";
import { formatLongDate, formatTime } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

const MINUTE = 60_000;
// Decision Q8: check-in opens 10 minutes before the start and closes 15 minutes after.
const OPENS_BEFORE = 10 * MINUTE;
const CLOSES_AFTER = 15 * MINUTE;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

function CheckoutDialog({ booking, onClose }: { booking: Booking | null; onClose: () => void }) {
  const [rating, setRating] = useState<"good" | "issue" | null>(null);
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  const descriptionError = rating === "issue" && description.trim().length < 10 ? "Describe the problem in at least 10 characters." : null;
  const ratingError = rating === null ? "Choose how the session went." : null;

  function reset() {
    setRating(null);
    setDescription("");
    setPhoto(null);
    setPhotoError(null);
    setAttempted(false);
  }

  function choosePhoto(file: File | undefined) {
    setPhotoError(null);
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) {
      setPhotoError("Use a JPEG, PNG, WebP or HEIC photo.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError("The photo is larger than 5 MB. Choose a smaller one.");
      return;
    }
    setPhoto(file);
  }

  function submit() {
    setAttempted(true);
    if (!booking || ratingError || descriptionError || photoError) return;
    checkOut(booking.id, {
      rating: rating!,
      description: rating === "issue" ? description.trim() : undefined,
      photoName: rating === "issue" ? photo?.name : undefined,
    });
    toast("success", "Checked out", rating === "issue" ? "Thanks. The sports office will review your report." : "Thanks for the feedback.");
    reset();
    onClose();
  }

  const choice = (value: "good" | "issue", Icon: typeof ThumbsUp, title: string, body: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={rating === value}
      onClick={() => setRating(value)}
      className={cn(
        "flex flex-1 flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
        rating === value ? "border-primary bg-brand-soft/60 ring-1 ring-primary" : "border-input bg-surface hover:bg-accent",
      )}
    >
      <Icon className={cn("h-5 w-5", value === "good" ? "text-success" : "text-warning")} aria-hidden />
      <span className="font-semibold">{title}</span>
      <span className="text-xs text-muted-foreground">{body}</span>
    </button>
  );

  return (
    <Dialog
      open={booking !== null}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Check out</DialogTitle>
          <DialogDescription>How was your session? Reports go only to the sports office.</DialogDescription>
        </DialogHeader>

        <div role="radiogroup" aria-label="Session feedback" className="flex gap-3">
          {choice("good", ThumbsUp, "All good", "No problems")}
          {choice("issue", TriangleAlert, "Report an issue", "Broken or unsafe")}
        </div>
        {attempted && ratingError && <FieldError className="mt-2">{ratingError}</FieldError>}

        {rating === "issue" && (
          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="issue-description">What is wrong?</Label>
              <Textarea
                id="issue-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
                placeholder="e.g. The net on court 2 is torn near the left post."
                aria-invalid={(attempted && !!descriptionError) || undefined}
                aria-describedby={attempted && descriptionError ? "issue-description-error" : undefined}
              />
              {attempted && descriptionError && <FieldError id="issue-description-error">{descriptionError}</FieldError>}
            </div>
            <div className="space-y-2">
              <span className="block text-sm font-semibold" id="photo-label">
                Photo <span className="font-normal text-muted-foreground">(optional)</span>
              </span>
              {photo ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border bg-surface-sunken px-3 py-2 text-sm">
                  <span className="truncate">{photo.name}</span>
                  <Button variant="ghost" size="icon" aria-label="Remove photo" onClick={() => setPhoto(null)}>
                    <X aria-hidden />
                  </Button>
                </div>
              ) : (
                <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-input text-sm font-semibold hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
                  <ImagePlus className="h-4 w-4" aria-hidden />
                  Add a photo
                  <input
                    type="file"
                    accept={PHOTO_TYPES.join(",")}
                    className="sr-only"
                    aria-labelledby="photo-label"
                    aria-describedby="photo-hint"
                    onChange={(e) => {
                      choosePhoto(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
              <FieldHint id="photo-hint">JPEG, PNG, WebP or HEIC, up to 5 MB.</FieldHint>
              {photoError && <FieldError>{photoError}</FieldError>}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="lg" onClick={() => { reset(); onClose(); }}>
            Not yet
          </Button>
          <Button size="lg" onClick={submit}>
            Check out
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CheckInPage() {
  const bookings = useBookings();
  const now = useNow();
  const [checkingOut, setCheckingOut] = useState<Booking | null>(null);

  if (!now) {
    return (
      <div className="container max-w-3xl py-6 sm:py-10">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="mt-6 h-40 w-full" />
      </div>
    );
  }

  const today = istDateString(now);
  const todays = bookings
    .filter((b) => b.date === today && b.status !== "cancelled")
    .sort((a, b) => a.slotIndex - b.slotIndex);

  function action(b: Booking) {
    const start = slotStartInstant(b.date, b.slotIndex).getTime();
    if (b.status === "checked_in") {
      return (
        <Button size="lg" variant="outline" className="sm:w-auto" onClick={() => setCheckingOut(b)}>
          Check out
        </Button>
      );
    }
    if (b.status === "completed") return <p className="text-sm text-muted-foreground">Session complete. Thanks for checking out.</p>;
    if (now!.getTime() < start - OPENS_BEFORE) {
      return <p className="text-sm text-muted-foreground">Check-in opens at {formatTime(new Date(start - OPENS_BEFORE))}.</p>;
    }
    if (now!.getTime() > start + CLOSES_AFTER) {
      return <p className="text-sm font-medium text-destructive">Check-in closed 15 minutes after the start.</p>;
    }
    return (
      <Button
        size="lg"
        onClick={() => {
          checkIn(b.id);
          toast("success", "Checked in", "Enjoy your game.");
        }}
      >
        Check in
      </Button>
    );
  }

  return (
    <div className="container max-w-3xl py-6 sm:py-10">
      <PageHeader title="Check in" description={formatLongDate(today)} />
      <PrototypeNotice />
      <p className="mt-3 text-sm text-muted-foreground">
        When booking goes live, the facility guard scans your booking pass to check you in. Until then you can try the flow here.
      </p>

      <div className="mt-6">
        {todays.length === 0 ? (
          <EmptyState
            icon={CalendarPlus}
            title="No bookings today"
            description="Your bookings for today appear here, with check-in and check-out."
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
                <BookingCard booking={b} actions={action(b)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <CheckoutDialog booking={checkingOut} onClose={() => setCheckingOut(null)} />
    </div>
  );
}
