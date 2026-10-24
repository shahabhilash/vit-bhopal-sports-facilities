"use client";
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarCheck, CheckCircle2, ChevronRight } from "lucide-react";
import { getSlot } from "@vitb/shared";
import { CourtPicker, DateStrip, SlotGrid } from "@/components/booking/pickers";
import { PlayerStepper, RosterInput, checkRoster } from "@/components/booking/participants";
import { PrototypeNotice } from "@/components/prototype-notice";
import { TurfReleaseInfo } from "@/components/turf-release-info";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Notice, Skeleton } from "@/components/ui/feedback";
import { bookableDates, slotStates } from "@/lib/availability";
import { BookingRuleError, createBooking, useBookings, type Booking } from "@/lib/bookings";
import { BOOKABLE, FACILITIES, isBookable, participantRange, type BookableCode } from "@/lib/catalog";
import { formatLongDate, slotLabel } from "@/lib/format";
import { useSessionStatus } from "@/lib/supabase/session";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

function SportPicker() {
  return (
    <div className="container max-w-2xl py-6 sm:py-10">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">What would you like to book?</h1>
      <ul className="mt-6 space-y-3">
        {BOOKABLE.map((code) => {
          const { min, max } = participantRange(code);
          return (
            <li key={code}>
              <Link
                href={`/book?sport=${code}`}
                className="flex items-center gap-4 rounded-xl border bg-surface p-4 shadow-card transition-colors hover:bg-accent"
              >
                <span className="flex-1">
                  <span className="block text-lg font-semibold">{FACILITIES[code].rule.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {FACILITIES[code].rule.resources.join(" · ")} · {min}–{max} players
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Section({ id, step, title, children, aside }: { id: string; step: number; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="flex items-center gap-2 text-base font-semibold">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-soft text-xs font-bold" aria-hidden>
            {step}
          </span>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function SummaryRows({ items }: { items: [string, string | null][] }) {
  return (
    <dl className="divide-y text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 py-2">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className={cn("text-right font-semibold", !v && "font-normal text-muted-foreground")}>{v ?? "Not chosen"}</dd>
        </div>
      ))}
    </dl>
  );
}

function BookingForm({ code }: { code: BookableCode }) {
  const router = useRouter();
  const now = useNow();
  const bookings = useBookings();
  const session = useSessionStatus();
  const facility = FACILITIES[code];
  const { min, max } = participantRange(code);
  const resources = facility.rule.resources;
  const isTurf = code === "turf";

  const [resource, setResource] = useState(resources[0] ?? "");
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [slotIndex, setSlotIndex] = useState<number | null>(null);
  const [players, setPlayers] = useState(min);
  const [roster, setRoster] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Booking | null>(null);

  const dates = useMemo(() => (now ? bookableDates(code, now) : []), [code, now]);
  const firstOpen = dates.find((d) => !d.opensAt)?.date ?? null;
  const date = pickedDate && dates.some((d) => d.date === pickedDate && !d.opensAt) ? pickedDate : firstOpen;
  const slots = useMemo(
    () => (now && date ? slotStates(code, resource, date, bookings, now) : []),
    [code, resource, date, bookings, now],
  );
  const selectedSlot = slots.find((s) => s.slot.index === slotIndex && s.state.kind === "open") ? slotIndex : null;
  const rosterCheck = useMemo(() => checkRoster(roster, min, max), [roster, min, max]);
  const rosterOk = !isTurf || (!rosterCheck.countError && rosterCheck.invalid.length === 0 && rosterCheck.duplicates.length === 0);
  const playerCount = isTurf ? rosterCheck.regNos.length : players;

  const missing = [!date && "a day", !selectedSlot && "a time", !rosterOk && "a valid player list"].filter(Boolean) as string[];

  function openReview() {
    setAttempted(true);
    setError(null);
    if (missing.length) return;
    if (session === "signed-out") {
      router.push(`/login?next=${encodeURIComponent(`/book?sport=${code}`)}`);
      return;
    }
    setReviewOpen(true);
  }

  function confirm() {
    if (!date || !selectedSlot) return;
    try {
      const booking = createBooking({
        facility: code,
        resource,
        date,
        slotIndex: selectedSlot,
        participants: playerCount,
        participantRegNos: isTurf ? rosterCheck.regNos : undefined,
      });
      setReviewOpen(false);
      setConfirmed(booking);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof BookingRuleError ? err.message : "Something went wrong. Please try again.");
    }
  }

  if (confirmed) {
    return (
      <div className="container max-w-lg py-10">
        <div className="rounded-xl border bg-surface p-6 text-center shadow-card">
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden />
          <h1 className="mt-3 text-2xl font-bold" tabIndex={-1} ref={(el) => el?.focus()}>
            Booking saved
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Saved on this device. It does not reserve the slot yet.</p>
          <div className="mt-5 text-left">
            <SummaryRows
              items={[
                ["Facility", `${facility.rule.name} · ${confirmed.resource}`],
                ["Day", formatLongDate(confirmed.date)],
                ["Time", slotLabel(confirmed.slotIndex)],
                ["Players", String(confirmed.participants)],
              ]}
            />
          </div>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link href="/my-bookings" className={cn(buttonVariants({ size: "lg" }), "sm:flex-1")}>
              <CalendarCheck aria-hidden />
              My bookings
            </Link>
            <Button variant="outline" size="lg" className="sm:flex-1" onClick={() => setConfirmed(null)}>
              Book another
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const summary: [string, string | null][] = [
    ["Facility", resources.length > 1 ? `${facility.rule.name} · ${resource}` : facility.rule.name],
    ["Day", date ? formatLongDate(date) : null],
    ["Time", selectedSlot ? slotLabel(selectedSlot) : null],
    ["Players", playerCount ? String(playerCount) : null],
  ];

  return (
    <div className="container pb-40 pt-4 sm:pt-8 md:pb-10">
      <Link href="/book" className="-ml-2 inline-flex h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All facilities
      </Link>
      <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Book {facility.rule.name.toLowerCase()}</h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-8">
          <PrototypeNotice />

          {resources.length > 1 && (
            <Section id="court-label" step={1} title="Court">
              <CourtPicker resources={resources} value={resource} onChange={setResource} />
            </Section>
          )}

          <Section id="day-label" step={resources.length > 1 ? 2 : 1} title="Day">
            {isTurf && <TurfReleaseInfo />}
            {!now ? (
              <div className="flex gap-2">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-16 w-[4.75rem]" />
                ))}
              </div>
            ) : dates.length === 0 || !firstOpen ? (
              <Notice tone="info" title="No days open right now">
                {isTurf ? "The next turf week opens on Friday at 12:00 PM." : "Today's slots are over. Check back tomorrow."}
              </Notice>
            ) : (
              <DateStrip options={dates} value={date ?? ""} onChange={(d) => { setPickedDate(d); setSlotIndex(null); }} now={now} />
            )}
          </Section>

          <Section
            id="time-label"
            step={resources.length > 1 ? 3 : 2}
            title="Time"
            aside={date && <span className="text-sm text-muted-foreground">{formatLongDate(date)}</span>}
          >
            {!now ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 12 }, (_, i) => (
                  <Skeleton key={i} className="h-[3.75rem]" />
                ))}
              </div>
            ) : date ? (
              <SlotGrid slots={slots} value={selectedSlot} onChange={setSlotIndex} />
            ) : null}
            {attempted && !selectedSlot && date && <p role="alert" className="text-sm font-medium text-destructive">Choose a time.</p>}
          </Section>

          <Section id="players-label" step={resources.length > 1 ? 4 : 3} title="Players">
            {isTurf ? (
              <RosterInput value={roster} onChange={setRoster} check={rosterCheck} showErrors={attempted} />
            ) : (
              <PlayerStepper value={players} min={min} max={max} onChange={setPlayers} />
            )}
          </Section>
        </div>

        {/* Desktop summary */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-xl border bg-surface p-5 shadow-card">
            <h2 className="font-semibold">Your booking</h2>
            <div className="mt-2">
              <SummaryRows items={summary} />
            </div>
            <Button size="lg" className="mt-4 w-full" onClick={openReview}>
              Review booking
              <ArrowRight aria-hidden />
            </Button>
            {attempted && missing.length > 0 && (
              <p role="alert" className="mt-2 text-sm text-destructive">Choose {missing.join(", ")}.</p>
            )}
          </div>
        </aside>
      </div>

      {/* Mobile summary bar, above the bottom navigation */}
      <div className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] z-30 border-t bg-surface/95 px-4 py-3 shadow-raised backdrop-blur md:bottom-0 lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate font-semibold">
              {date && selectedSlot ? `${formatLongDate(date).split(",")[0]}, ${getSlot(selectedSlot)?.label.split(" – ")[0]}` : date ? "Choose a time" : "Choose a day and time"}
            </p>
            <p className="truncate text-muted-foreground">
              {resources.length > 1 ? `${resource} · ` : ""}
              {playerCount} player{playerCount === 1 ? "" : "s"}
            </p>
          </div>
          <Button size="lg" onClick={openReview}>
            Review
          </Button>
        </div>
        {attempted && missing.length > 0 && (
          <p role="alert" className="mx-auto mt-1 max-w-2xl text-sm text-destructive">Choose {missing.join(", ")}.</p>
        )}
      </div>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm your booking</DialogTitle>
            <DialogDescription>Check the details before you confirm.</DialogDescription>
          </DialogHeader>
          <SummaryRows items={summary} />
          {isTurf && (
            <p className="mt-3 break-words text-xs text-muted-foreground">Players: {rosterCheck.regNos.join(", ")}</p>
          )}
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Check in with the guard within 15 minutes of the start, or the slot is released.</li>
            <li>Free cancellation until 1 hour before the start.</li>
          </ul>
          {error && (
            <Notice tone="danger" live className="mt-4">
              {error}
            </Notice>
          )}
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => setReviewOpen(false)}>
              Go back
            </Button>
            <Button size="lg" onClick={confirm}>
              Confirm booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BookPageInner() {
  const sport = useSearchParams().get("sport");
  if (!isBookable(sport)) return <SportPicker />;
  // Remount per sport so selections never leak between facilities.
  return <BookingForm key={sport} code={sport} />;
}

export default function BookPage() {
  return (
    <Suspense fallback={<div className="container py-10"><Skeleton className="h-8 w-48" /></div>}>
      <BookPageInner />
    </Suspense>
  );
}
