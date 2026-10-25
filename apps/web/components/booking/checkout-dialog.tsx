"use client";
import { useState } from "react";
import { ImagePlus, ThumbsUp, TriangleAlert, X } from "lucide-react";
import { MAX_PHOTO_BYTES, PHOTO_TYPES } from "@vitb/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Notice } from "@/components/ui/feedback";
import { FieldError, FieldHint, Label, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { errorMessage } from "@/lib/api";
import { checkOut, uploadIssuePhoto, type Booking } from "@/lib/bookings";
import { cn } from "@/lib/utils";

export function CheckoutDialog({ booking, onClose }: { booking: Booking | null; onClose: () => void }) {
  const [rating, setRating] = useState<"good" | "issue" | null>(null);
  const [description, setDescription] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  function choosePhoto(file: File | undefined) {
    setPhotoError(null);
    if (!file) return;
    // A quick check here; the server re-checks size and the file's real type.
    if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) {
      setPhotoError("Use a JPEG, PNG or WebP photo.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError("The photo is larger than 5 MB. Choose a smaller one.");
      return;
    }
    setPhoto(file);
  }

  const ratingError = rating === null ? "Choose how the session went." : null;
  const descriptionError =
    rating === "issue" && description.trim().length < 10 ? "Describe the problem in at least 10 characters." : null;

  function close() {
    if (saving) return;
    setRating(null);
    setDescription("");
    setAttempted(false);
    setError(null);
    setPhoto(null);
    setPhotoError(null);
    onClose();
  }

  async function submit() {
    setAttempted(true);
    setError(null);
    if (!booking || ratingError || descriptionError) return;
    setSaving(true);
    try {
      await checkOut(booking.id, { rating: rating!, description: description.trim() || undefined });
      // The checkout is final; a failed photo upload is reported but never undoes it.
      const photoFailed =
        rating === "issue" && photo
          ? await uploadIssuePhoto(booking.id, photo).then(
              () => null,
              (err: unknown) => errorMessage(err),
            )
          : null;
      if (photoFailed) {
        toast("error", "Checked out, but the photo was not uploaded", photoFailed);
      } else {
        toast("success", "Checked out", rating === "issue" ? "Thanks. The sports office will review your report." : "Thanks for the feedback.");
      }
      setSaving(false);
      close();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
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
    <Dialog open={booking !== null} onOpenChange={(open) => !open && close()}>
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
          <div className="mt-5 space-y-2">
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
            <div className="space-y-2 pt-2">
              <span id="photo-label" className="block text-sm font-semibold">
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
                <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-input text-sm font-semibold focus-within:ring-2 focus-within:ring-ring hover:bg-accent">
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
              <FieldHint id="photo-hint">JPEG, PNG or WebP, up to 5 MB. Only the sports office can see it.</FieldHint>
              {photoError && <FieldError>{photoError}</FieldError>}
            </div>
          </div>
        )}
        {error && (
          <Notice tone="danger" live className="mt-4">
            {error}
          </Notice>
        )}
        <DialogFooter>
          <Button variant="outline" size="lg" onClick={close} disabled={saving}>
            Not yet
          </Button>
          <Button size="lg" onClick={submit} disabled={saving}>
            {saving ? "Checking out…" : "Check out"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
