"use client";
import { Suspense, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarCheck, CheckCircle2, ChevronRight, RefreshCw } from "lucide-react";
import { getSlot } from "@vitb/shared";
import { CourtPicker, DateStrip, SlotGrid } from "@/components/booking/pickers";
import { PlayerInputs, checkPlayers } from "@/components/booking/participants";
import { TurfReleaseInfo } from "@/components/turf-release-info";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Notice, Skeleton } from "@/components/ui/feedback";
import { ApiRequestError, errorMessage, isApiConfigured } from "@/lib/api";
import { bookableDates, slotStates } from "@/lib/availability";
import { createBooking, joinWaitlist, useAvailability, useMyBookings, useProfile, useResources, type Booking } from "@/lib/bookings";
import type { WaitlistEntryDto } from "@vitb/shared";
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

/** Explains a failed booking, including the specific players or fields to fix. */
function BookingError({ error }: { error: unknown }) {
  const details = error instanceof ApiRequestError ? (error.details as Record<string, string[]> | undefined) : undefined;
  const lists: [string, string[] | undefined][] = [
    ["Not valid", details?.invalid],
    ["Listed twice", details?.duplicates],
  ];
  return (
    <Notice tone="danger" live className="mt-4" title={errorMessage(error)}>
      {lists.map(([label, items]) =>
        Array.isArray(items) && items.length > 0 ? (
          <p key={label}>
            {label}: <span className="font-mono">{items.join(", ")}</span>
          </p>
        ) : null,
      )}
      {error instanceof ApiRequestError && error.code === "PROFILE_INCOMPLETE" && (
        <Link href="/account" className="font-semibold text-primary underline underline-offset-4">
          Go to Account
        </Link>
      )}
    </Notice>
  );
}

function BookingForm({ code }: { code: BookableCode }) {
  const router = useRouter();
  const now = useNow();
  const session = useSessionStatus();
  const facility = FACILITIES[code];
  const { min, max } = participantRange(code);
  const resourceNames = facility.rule.resources;
  const isTurf = code === "turf";

  const [resourceName, setResourceName] = useState(resourceNames[0] ?? "");
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [slotIndex, setSlotIndex] = useState<number | null>(null);
  const [players, setPlayers] = useState<string[]>(() => Array.from({ length: min }, () => ""));
  const [reviewOpen, setReviewOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [confirmed, setConfirmed] = useState<Booking | null>(null);
  const [joined, setJoined] = useState<WaitlistEntryDto | null>(null);
  const idempotencyKey = useRef<string>("");

  const resources = useResources();
  const resourceId = resources.data?.find((r) => r.facility === code && r.name === resourceName)?.id ?? null;

  const dates = useMemo(() => (now ? bookableDates(code, now) : []), [code, now]);
  const firstOpen = dates.find((d) => !d.opensAt)?.date ?? null;
  const date = pickedDate && dates.some((d) => d.date === pickedDate && !d.opensAt) ? pickedDate : firstOpen;

  const availability = useAvailability(code, dates[0]?.date ?? null, dates[dates.length - 1]?.date ?? null);
  const myBookings = useMyBookings(session);
  const profile = useProfile(session);
  const ownRegNo = profile.data?.regNo ?? null;
  // The first box is always the booker's own number when the account has one.
  const playerBoxes = useMemo(() => (ownRegNo ? [ownRegNo, ...players.slice(1)] : players), [ownRegNo, players]);

  const slots = useMemo(
    () => (now && date ? slotStates(code, resourceId, date, availability.data, myBookings.data, now) : []),
    [code, resourceId, date, availability.data, myBookings.data, now],
  );
  const selectedState = slots.find((s) => s.slot.index === slotIndex)?.state;
  const waitlistMode = selectedState?.kind === "booked" && selectedState.waitlist;
  const selectedSlot = selectedState && (selectedState.kind === "open" || waitlistMode) ? slotIndex : null;
  const playersCheck = useMemo(() => checkPlayers(playerBoxes, min, max), [playerBoxes, min, max]);
  const rosterOk = !playersCheck.countError && playersCheck.boxErrors.every((e) => e === null);
  const playerCount = playersCheck.regNos.length;
  const missing = [!date && "a day", !selectedSlot && "a time", !rosterOk && "a valid player list"].filter(Boolean) as string[];

  function openReview() {
    setAttempted(true);
    setError(null);
    if (missing.length) return;
    if (session === "signed-out") {
      router.push(`/login?next=${encodeURIComponent(`/book?sport=${code}`)}`);
      return;
    }
    // One key per review: retries of this submission are recognised by the server.
    idempotencyKey.current = crypto.randomUUID();
    setReviewOpen(true);
  }

  async function confirm() {
    if (!date || !selectedSlot || !resourceId || submitting) return;
    setSubmitting(true);
    setError(null);
    const input = { resourceId, date, slotIndex: selectedSlot, participantRegNos: playersCheck.regNos };
    try {
      if (waitlistMode) {
        setJoined(await joinWaitlist(input));
      } else {
        setConfirmed(await createBooking(input, idempotencyKey.current));
      }
      setReviewOpen(false);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err);
      if (err instanceof ApiRequestError && err.code === "SLOT_TAKEN") setSlotIndex(null);
    } finally {
      setSubmitting(false);
    }
  }

  if (joined) {
    return (
      <div className="container max-w-lg py-10">
        <div className="rounded-xl border bg-surface p-6 text-center shadow-card">
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden />
          <h1 className="mt-3 text-2xl font-bold" tabIndex={-1} ref={(el) => el?.focus()}>
            You&apos;re on the waiting list
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Position {joined.position ?? 1}. If the slot is cancelled at least 2 hours before it starts, it is offered to
            you for 10 minutes. Offers appear in My bookings.
          </p>
          <div className="mt-5 text-left">
            <SummaryRows
              items={[
                ["Facility", `${facility.rule.name} · ${joined.resource}`],
                ["Day", formatLongDate(joined.date)],
                ["Time", slotLabel(joined.slotIndex)],
              ]}
            />
          </div>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link href="/my-bookings" className={cn(buttonVariants({ size: "lg" }), "sm:flex-1")}>
              <CalendarCheck aria-hidden />
              My bookings
            </Link>
            <Button
              variant="outline"
              size="lg"
              className="sm:flex-1"
              onClick={() => {
                setJoined(null);
                setSlotIndex(null);
                setAttempted(false);
              }}
            >
              Back to slots
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (confirmed) {
    return (
      <div className="container max-w-lg py-10">
        <div className="rounded-xl border bg-surface p-6 text-center shadow-card">
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden />
          <h1 className="mt-3 text-2xl font-bold" tabIndex={-1} ref={(el) => el?.focus()}>
            You&apos;re booked
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Check in with the guard within 15 minutes of the start, or the slot is released.
          </p>
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
            <Button
              variant="outline"
              size="lg"
              className="sm:flex-1"
              onClick={() => {
                setConfirmed(null);
                setSlotIndex(null);
                setAttempted(false);
              }}
            >
              Book another
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const summary: [string, string | null][] = [
    ["Facility", resourceNames.length > 1 ? `${facility.rule.name} · ${resourceName}` : facility.rule.name],
    ["Day", date ? formatLongDate(date) : null],
    ["Time", selectedSlot ? `${slotLabel(selectedSlot)}${waitlistMode ? " (waiting list)" : ""}` : null],
    ["Players", playerCount ? String(playerCount) : null],
  ];
  const loadError = resources.error ?? availability.error;
  const retryLoad = () => {
    void resources.refresh();
    void availability.refresh();
  };

  return (
    <div className="container pb-40 pt-4 sm:pt-8 md:pb-10">
      <Link href="/book" className="-ml-2 inline-flex h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All facilities
      </Link>
      <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Book {facility.rule.name.toLowerCase()}</h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-8">
          {!isApiConfigured ? (
            <Notice tone="warning" title="Booking is not available here yet">
              This environment is not connected to the booking service.
            </Notice>
          ) : loadError ? (
            <Notice tone="danger" title="Could not load open slots">
              <p>{errorMessage(loadError)}</p>
              <Button variant="outline" className="mt-2" onClick={retryLoad}>
                <RefreshCw aria-hidden />
                Try again
              </Button>
            </Notice>
          ) : null}
          {session === "signed-out" && (
            <Notice tone="info">
              You can look around now; you&apos;ll be asked to sign in with your college email before booking.
            </Notice>
          )}
          {session === "signed-in" && profile.data && !profile.data.regNo && (
            <Notice tone="warning" title="Add your registration number first">
              Bookings list every player by registration number, including you.{" "}
              <Link href="/account" className="font-semibold text-primary underline underline-offset-4">
                Go to Account
              </Link>
            </Notice>
          )}

          {resourceNames.length > 1 && (
            <Section id="court-label" step={1} title="Court">
              <CourtPicker
                resources={resourceNames}
                value={resourceName}
                onChange={(r) => {
                  setResourceName(r);
                  setSlotIndex(null);
                }}
              />
            </Section>
          )}

          <Section id="day-label" step={resourceNames.length > 1 ? 2 : 1} title="Day">
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
              <DateStrip
                options={dates}
                value={date ?? ""}
                onChange={(d) => {
                  setPickedDate(d);
                  setSlotIndex(null);
                }}
                now={now}
              />
            )}
          </Section>

          <Section
            id="time-label"
            step={resourceNames.length > 1 ? 3 : 2}
            title="Time"
            aside={
              availability.refreshing ? (
                <span className="text-sm text-muted-foreground" aria-live="polite">
                  Updating…
                </span>
              ) : date ? (
                <span className="text-sm text-muted-foreground">{formatLongDate(date)}</span>
              ) : null
            }
          >
            {!now ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 12 }, (_, i) => (
                  <Skeleton key={i} className="h-[3.75rem]" />
                ))}
              </div>
            ) : date && isApiConfigured && !loadError ? (
              <SlotGrid slots={slots} value={selectedSlot} onChange={setSlotIndex} />
            ) : null}
            {attempted && !selectedSlot && date && (
              <p role="alert" className="text-sm font-medium text-destructive">
                Choose a time.
              </p>
            )}
          </Section>

          <Section id="players-label" step={resourceNames.length > 1 ? 4 : 3} title="Players">
            <PlayerInputs
              values={playerBoxes}
              onChange={setPlayers}
              min={min}
              max={max}
              ownRegNo={ownRegNo}
              check={playersCheck}
              showErrors={attempted}
            />
            <p className="mt-2 text-sm text-muted-foreground">
              Only you need an account. Your friends do not have to sign in; just enter their registration numbers.
            </p>
          </Section>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-xl border bg-surface p-5 shadow-card">
            <h2 className="font-semibold">Your booking</h2>
            <div className="mt-2">
              <SummaryRows items={summary} />
            </div>
            <Button size="lg" className="mt-4 w-full" onClick={openReview} disabled={!isApiConfigured}>
              Review booking
              <ArrowRight aria-hidden />
            </Button>
            {attempted && missing.length > 0 && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                Choose {missing.join(", ")}.
              </p>
            )}
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] z-30 border-t bg-surface/95 px-4 py-3 shadow-raised backdrop-blur md:bottom-0 lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate font-semibold">
              {date && selectedSlot
                ? `${formatLongDate(date).split(",")[0]}, ${getSlot(selectedSlot)?.label.split(" – ")[0]}`
                : date
                  ? "Choose a time"
                  : "Choose a day and time"}
            </p>
            <p className="truncate text-muted-foreground">
              {resourceNames.length > 1 ? `${resourceName} · ` : ""}
              {playerCount} player{playerCount === 1 ? "" : "s"}
            </p>
          </div>
          <Button size="lg" onClick={openReview} disabled={!isApiConfigured}>
            Review
          </Button>
        </div>
        {attempted && missing.length > 0 && (
          <p role="alert" className="mx-auto mt-1 max-w-2xl text-sm text-destructive">
            Choose {missing.join(", ")}.
          </p>
        )}
      </div>

      <Dialog open={reviewOpen} onOpenChange={(open) => !submitting && setReviewOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{waitlistMode ? "Join the waiting list" : "Confirm your booking"}</DialogTitle>
            <DialogDescription>
              {waitlistMode
                ? "This slot is booked. If it is cancelled at least 2 hours before the start, it is offered to the first person waiting, for 10 minutes."
                : "Check the details before you confirm."}
            </DialogDescription>
          </DialogHeader>
          <SummaryRows items={summary} />
          <p className="mt-3 break-words text-xs text-muted-foreground">Players: {playersCheck.regNos.join(", ")}</p>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {waitlistMode ? (
              <li>Accepting an offer books the slot with the same details, after the usual checks.</li>
            ) : (
              <>
                <li>Check in with the guard within 15 minutes of the start, or the slot is released.</li>
                <li>Free cancellation until 1 hour before the start.</li>
              </>
            )}
          </ul>
          {error !== null && <BookingError error={error} />}
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => setReviewOpen(false)} disabled={submitting}>
              Go back
            </Button>
            {!(error instanceof ApiRequestError && error.code === "SLOT_TAKEN") && (
              <Button size="lg" onClick={confirm} disabled={submitting || !resourceId}>
                {submitting ? "Saving…" : error !== null ? "Try again" : waitlistMode ? "Join waiting list" : "Confirm booking"}
              </Button>
            )}
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
    <Suspense
      fallback={
        <div className="container py-10">
          <Skeleton className="h-8 w-48" />
        </div>
      }
    >
      <BookPageInner />
    </Suspense>
  );
}
