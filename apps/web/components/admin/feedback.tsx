"use client";
import { useEffect, useState } from "react";
import { Image as ImageIcon, MessageSquareText, ThumbsUp, TriangleAlert } from "lucide-react";
import { FEEDBACK_STATUSES, type FeedbackItemDto, type FeedbackStatus } from "@vitb/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Notice, Skeleton } from "@/components/ui/feedback";
import { Label } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { errorMessage } from "@/lib/api";
import { feedbackPhotoUrl, setFeedbackStatus, useFeedback, type FeedbackFilters } from "@/lib/admin";
import { BOOKABLE, FACILITIES } from "@/lib/catalog";
import { formatDayMonth, slotLabel } from "@/lib/format";

const STATUS_LABEL: Record<FeedbackStatus, string> = { open: "Open", in_progress: "In progress", resolved: "Resolved" };
const selectClass =
  "h-11 w-full rounded-lg border border-input bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function PhotoViewer({ item, onClose }: { item: FeedbackItemDto | null; onClose: () => void }) {
  const [photo, setPhoto] = useState<{ id: string; url?: string; error?: string } | null>(null);

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    // Fetch a fresh 60-second link each time the viewer opens.
    feedbackPhotoUrl(item.id)
      .then(({ url }) => !cancelled && setPhoto({ id: item.id, url }))
      .catch((err: unknown) => !cancelled && setPhoto({ id: item.id, error: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [item]);

  const current = item && photo?.id === item.id ? photo : null;
  return (
    <Dialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) {
          setPhoto(null);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Issue photo</DialogTitle>
          {item && <DialogDescription>{item.description}</DialogDescription>}
        </DialogHeader>
        {current?.error ? (
          <Notice tone="danger">{current.error}</Notice>
        ) : current?.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage
          <img src={current.url} alt={`Photo attached to the report: ${item?.description ?? ""}`} className="max-h-[70dvh] w-full rounded-lg object-contain" />
        ) : (
          <Skeleton className="aspect-video w-full" />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AdminFeedback() {
  const [filters, setFilters] = useState<FeedbackFilters>({ status: "open", facility: "", rating: "issue" });
  const [offset, setOffset] = useState(0);
  const { data, error, loading } = useFeedback(filters, offset);
  const [viewing, setViewing] = useState<FeedbackItemDto | null>(null);

  const update = <K extends keyof FeedbackFilters>(k: K, v: FeedbackFilters[K]) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setOffset(0);
  };

  async function changeStatus(item: FeedbackItemDto, status: FeedbackStatus) {
    try {
      await setFeedbackStatus(item.id, status);
      toast("success", `Marked ${STATUS_LABEL[status].toLowerCase()}`);
    } catch (err) {
      toast("error", "Could not update the report", errorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="fb-status">Status</Label>
          <select id="fb-status" className={selectClass} value={filters.status} onChange={(e) => update("status", e.target.value as FeedbackFilters["status"])}>
            <option value="">Any status</option>
            {FEEDBACK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="fb-type">Type</Label>
          <select id="fb-type" className={selectClass} value={filters.rating} onChange={(e) => update("rating", e.target.value as FeedbackFilters["rating"])}>
            <option value="">All feedback</option>
            <option value="issue">Issues only</option>
            <option value="good">Positive only</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="fb-facility">Facility</Label>
          <select id="fb-facility" className={selectClass} value={filters.facility} onChange={(e) => update("facility", e.target.value)}>
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
      ) : data.items.length === 0 ? (
        <EmptyState icon={MessageSquareText} title="Nothing here" description="No feedback matches these filters." />
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {data.total} report{data.total === 1 ? "" : "s"}
          </p>
          <ul className="space-y-3">
            {data.items.map((item) => (
              <li key={item.id} className="rounded-xl border bg-card p-4 shadow-card">
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                  <div className="space-y-1 text-sm">
                    <p className="flex items-center gap-2 font-semibold">
                      {item.rating === "issue" ? (
                        <TriangleAlert className="h-4 w-4 text-warning" aria-hidden />
                      ) : (
                        <ThumbsUp className="h-4 w-4 text-success" aria-hidden />
                      )}
                      {FACILITIES[item.facility].rule.name} {item.resource} · {formatDayMonth(item.date)}
                      {item.slotIndex ? `, ${slotLabel(item.slotIndex)}` : ""}
                    </p>
                    {item.description && <p className="text-base">{item.description}</p>}
                    <p className="text-muted-foreground">
                      {item.authorName ?? "Student"}
                      {item.authorRegNo ? ` (${item.authorRegNo})` : ""}
                    </p>
                    <Badge tone={item.status === "resolved" ? "success" : item.status === "in_progress" ? "info" : "warning"}>
                      {STATUS_LABEL[item.status]}
                    </Badge>
                  </div>
                  <div className="flex flex-col gap-2 sm:w-44">
                    {item.hasPhoto && (
                      <Button variant="outline" onClick={() => setViewing(item)}>
                        <ImageIcon aria-hidden />
                        View photo
                      </Button>
                    )}
                    <label className="sr-only" htmlFor={`status-${item.id}`}>
                      Status
                    </label>
                    <select
                      id={`status-${item.id}`}
                      className={selectClass}
                      value={item.status}
                      onChange={(e) => void changeStatus(item, e.target.value as FeedbackStatus)}
                    >
                      {FEEDBACK_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex justify-between">
            <Button variant="outline" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - 20))}>
              Previous
            </Button>
            <Button variant="outline" disabled={offset + 20 >= data.total} onClick={() => setOffset((o) => o + 20)}>
              Next
            </Button>
          </div>
        </>
      )}
      <PhotoViewer item={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
