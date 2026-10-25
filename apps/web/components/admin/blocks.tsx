"use client";
import { useState } from "react";
import { CalendarOff, Pencil, Plus, Trash2 } from "lucide-react";
import { BLOCK_REASONS, TIME_SLOTS, istDateString, type BlockDto, type BlockOverlapsDto, type BlockReason } from "@vitb/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Notice, Skeleton } from "@/components/ui/feedback";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { deleteBlock, previewBlock, saveBlock, useBlocks, type BlockInput } from "@/lib/admin";
import { useResources } from "@/lib/bookings";
import { BOOKABLE, FACILITIES, type BookableCode } from "@/lib/catalog";
import { formatDayMonth, slotLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const REASON_LABEL: Record<BlockReason, string> = {
  hpl: "Booked for HPL",
  maintenance: "Under maintenance",
  event: "Reserved for an event",
  other: "Unavailable",
};

const selectClass =
  "h-12 w-full rounded-lg border border-input bg-surface px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function describeSlots(slots: number[] | null) {
  if (!slots) return "All day";
  return slots.map((s) => slotLabel(s).split(" – ")[0]).join(", ");
}

function BlockEditor({ block, onClose }: { block: BlockDto | null | "new"; onClose: () => void }) {
  const resources = useResources();
  const existing = block && block !== "new" ? block : null;
  const today = istDateString();
  const [form, setForm] = useState<BlockInput>(() => ({
    facility: (existing?.facility as BookableCode) ?? "tennis",
    resourceId: existing?.resourceId ?? null,
    startDate: existing?.startDate ?? today,
    endDate: existing?.endDate ?? today,
    slotIndexes: existing?.slotIndexes ?? null,
    reason: existing?.reason ?? "maintenance",
    note: existing?.note ?? "",
  }));
  const [overlaps, setOverlaps] = useState<BlockOverlapsDto | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof BlockInput>(k: K, v: BlockInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setOverlaps(null);
    setConfirmCancel(false);
  };
  const courts = resources.data?.filter((r) => r.facility === form.facility) ?? [];
  const toggleSlot = (s: number) => {
    const current = form.slotIndexes ?? [];
    const next = current.includes(s) ? current.filter((x) => x !== s) : [...current, s].sort((a, b) => a - b);
    set("slotIndexes", next.length ? next : null);
  };
  const activeConflicts = overlaps?.bookings.filter((b) => b.status === "confirmed") ?? [];

  async function check() {
    setBusy(true);
    setError(null);
    try {
      setOverlaps(await previewBlock(form, existing?.id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await saveBlock(form, { id: existing?.id, cancelAffected: confirmCancel });
      toast("success", existing ? "Block updated" : "Block created", r.cancelled ? `${r.cancelled} booking(s) cancelled.` : undefined);
      onClose();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "BLOCK_CONFLICT") {
        setOverlaps(await previewBlock(form, existing?.id).catch(() => null));
      }
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit block" : "Block a facility"}</DialogTitle>
          <DialogDescription>Students see the reason; your note stays internal.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="b-facility">Facility</Label>
            <select
              id="b-facility"
              className={selectClass}
              value={form.facility}
              onChange={(e) => {
                set("facility", e.target.value as BookableCode);
                set("resourceId", null);
              }}
            >
              {BOOKABLE.map((c) => (
                <option key={c} value={c}>
                  {FACILITIES[c].rule.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="b-court">Court</Label>
            <select id="b-court" className={selectClass} value={form.resourceId ?? ""} onChange={(e) => set("resourceId", e.target.value || null)}>
              <option value="">All courts</option>
              {courts.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="b-start">From</Label>
            <Input id="b-start" type="date" min={today} value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="b-end">To</Label>
            <Input id="b-end" type="date" min={form.startDate} value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
          </div>
          <fieldset className="space-y-2 sm:col-span-2">
            <legend className="text-sm font-semibold">Time</legend>
            <label className="flex h-11 items-center gap-3 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={form.slotIndexes === null} onChange={(e) => set("slotIndexes", e.target.checked ? null : [1])} />
              All day (every slot)
            </label>
            {form.slotIndexes !== null && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {TIME_SLOTS.map((s) => {
                  const on = form.slotIndexes?.includes(s.index) ?? false;
                  return (
                    <button
                      key={s.index}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleSlot(s.index)}
                      className={cn("h-11 rounded-lg border text-sm font-semibold", on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-surface hover:bg-accent")}
                    >
                      {s.label.split(" – ")[0]}
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>
          <div className="space-y-1">
            <Label htmlFor="b-reason">Reason shown to students</Label>
            <select id="b-reason" className={selectClass} value={form.reason} onChange={(e) => set("reason", e.target.value as BlockReason)}>
              {BLOCK_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REASON_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="b-note">Internal note (optional)</Label>
            <Textarea id="b-note" maxLength={1000} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className="min-h-20" />
            <FieldHint>Only administrators can see this.</FieldHint>
          </div>
        </div>

        {overlaps && (
          <div className="mt-5 space-y-3">
            {overlaps.blocks.length > 0 && (
              <Notice tone="info" title="Overlaps existing blocks">
                {overlaps.blocks.map((b) => `${b.label} (${formatDayMonth(b.startDate)} – ${formatDayMonth(b.endDate)})`).join("; ")}
              </Notice>
            )}
            {overlaps.bookings.length === 0 ? (
              <Notice tone="success">No bookings are affected.</Notice>
            ) : (
              <Notice tone="warning" title={`${activeConflicts.length} booking(s) will be cancelled`}>
                <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
                  {overlaps.bookings.map((b) => (
                    <li key={b.id}>
                      {formatDayMonth(b.date)} {slotLabel(b.slotIndex)}, {b.resource}: {b.ownerName ?? "—"} {b.ownerRegNo ? `(${b.ownerRegNo})` : ""}
                      {b.status === "checked_in" ? " (in progress, not cancelled)" : ""}
                    </li>
                  ))}
                </ul>
                {activeConflicts.length > 0 && (
                  <label className="mt-3 flex items-start gap-3 font-semibold">
                    <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[hsl(var(--primary))]" checked={confirmCancel} onChange={(e) => setConfirmCancel(e.target.checked)} />
                    Cancel these bookings. Students will see &ldquo;Cancelled by the sports office: {REASON_LABEL[form.reason]}&rdquo;.
                  </label>
                )}
              </Notice>
            )}
          </div>
        )}
        {error && (
          <Notice tone="danger" live className="mt-4">
            {error}
          </Notice>
        )}
        <DialogFooter>
          <Button variant="outline" size="lg" onClick={onClose} disabled={busy}>
            Close
          </Button>
          {!overlaps ? (
            <Button size="lg" onClick={check} disabled={busy}>
              {busy ? "Checking…" : "Check for conflicts"}
            </Button>
          ) : (
            <Button size="lg" onClick={save} disabled={busy || (activeConflicts.length > 0 && !confirmCancel)}>
              {busy ? "Saving…" : existing ? "Save changes" : "Create block"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdminBlocks() {
  const { data, error, loading } = useBlocks();
  const [editing, setEditing] = useState<BlockDto | "new" | null>(null);
  const [removing, setRemoving] = useState<BlockDto | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      await deleteBlock(removing.id);
      toast("success", "Block removed", "The slots are bookable again.");
      setRemoving(null);
    } catch (err) {
      toast("error", "Could not remove the block", errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="lg" onClick={() => setEditing("new")}>
          <Plus aria-hidden />
          New block
        </Button>
      </div>
      {error ? (
        <Notice tone="danger">{errorMessage(error)}</Notice>
      ) : loading || !data ? (
        <Skeleton className="h-32" />
      ) : data.length === 0 ? (
        <EmptyState icon={CalendarOff} title="No current or upcoming blocks" description="Block a court for HPL matches, maintenance or events." />
      ) : (
        <ul className="space-y-3">
          {data.map((b) => (
            <li key={b.id} className="rounded-xl border bg-card p-4 shadow-card">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1 text-sm">
                  <p className="text-base font-semibold">
                    {FACILITIES[b.facility].rule.name} · {b.resource ?? "All courts"}
                  </p>
                  <p>
                    {formatDayMonth(b.startDate)}
                    {b.endDate !== b.startDate && ` – ${formatDayMonth(b.endDate)}`} · {describeSlots(b.slotIndexes)}
                  </p>
                  <Badge tone={b.reason === "maintenance" ? "warning" : "info"}>{b.label}</Badge>
                  {b.note && <p className="text-muted-foreground">Note: {b.note}</p>}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditing(b)}>
                    <Pencil aria-hidden />
                    Edit
                  </Button>
                  <Button variant="ghost" className="text-destructive" onClick={() => setRemoving(b)}>
                    <Trash2 aria-hidden />
                    Remove
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && <BlockEditor key={editing === "new" ? "new" : editing.id} block={editing} onClose={() => setEditing(null)} />}

      <Dialog open={removing !== null} onOpenChange={(open) => !open && !busy && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this block?</DialogTitle>
            <DialogDescription>
              The slots become bookable again immediately. Bookings cancelled by this block are not restored.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => setRemoving(null)} disabled={busy}>
              Keep block
            </Button>
            <Button variant="destructive" size="lg" onClick={remove} disabled={busy}>
              {busy ? "Removing…" : "Remove block"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
