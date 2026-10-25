"use client";
import { useState } from "react";
import { ThumbsUp, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Notice } from "@/components/ui/feedback";
import { FieldError, Label, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { errorMessage } from "@/lib/api";
import { checkOut, type Booking } from "@/lib/bookings";
import { cn } from "@/lib/utils";

export function CheckoutDialog({ booking, onClose }: { booking: Booking | null; onClose: () => void }) {
  const [rating, setRating] = useState<"good" | "issue" | null>(null);
  const [description, setDescription] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ratingError = rating === null ? "Choose how the session went." : null;
  const descriptionError =
    rating === "issue" && description.trim().length < 10 ? "Describe the problem in at least 10 characters." : null;

  function close() {
    if (saving) return;
    setRating(null);
    setDescription("");
    setAttempted(false);
    setError(null);
    onClose();
  }

  async function submit() {
    setAttempted(true);
    setError(null);
    if (!booking || ratingError || descriptionError) return;
    setSaving(true);
    try {
      await checkOut(booking.id, { rating: rating!, description: description.trim() || undefined });
      toast("success", "Checked out", rating === "issue" ? "Thanks. The sports office will review your report." : "Thanks for the feedback.");
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
            <p className="text-sm text-muted-foreground">Photo uploads are coming soon.</p>
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
