import type { ReactNode } from "react";
import { CalendarDays, CheckCircle2, CircleDot, Clock, LogIn, TimerOff, Users, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Booking, BookingStatus } from "@/lib/bookings";
import { FACILITIES } from "@/lib/catalog";
import { formatLongDate, slotLabel } from "@/lib/format";

const STATUS: Record<BookingStatus, { label: string; tone: "brand" | "success" | "neutral" | "danger"; icon: typeof CircleDot }> = {
  confirmed: { label: "Upcoming", tone: "brand", icon: CircleDot },
  checked_in: { label: "Checked in", tone: "success", icon: LogIn },
  completed: { label: "Completed", tone: "neutral", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", tone: "danger", icon: XCircle },
  no_show: { label: "Missed", tone: "danger", icon: TimerOff },
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  const { label, tone, icon: Icon } = STATUS[status];
  return (
    <Badge tone={tone}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}

export function BookingCard({ booking, actions }: { booking: Booking; actions?: ReactNode }) {
  const facility = FACILITIES[booking.facility];
  const multiple = facility.rule.resources.length > 1;
  return (
    <article className="rounded-xl border bg-card p-4 shadow-card sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold sm:text-lg">
          {facility.rule.name}
          {multiple && <span className="font-normal text-muted-foreground"> · {booking.resource}</span>}
        </h3>
        <StatusBadge status={booking.status} />
      </div>
      <dl className="mt-3 grid gap-1.5 text-sm">
        <div className="flex items-center gap-2">
          <dt className="sr-only">Day</dt>
          <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
          <dd>{formatLongDate(booking.date)}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="sr-only">Time</dt>
          <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
          <dd className="font-semibold">{slotLabel(booking.slotIndex)}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="sr-only">Players</dt>
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
          <dd>
            {booking.participants} player{booking.participants === 1 ? "" : "s"}
            {!booking.isOwner && <span className="text-muted-foreground"> · you are listed as a player</span>}
          </dd>
        </div>
      </dl>
      {booking.status === "cancelled" && booking.cancelReason && (
        <p className="mt-3 rounded-lg bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive">{booking.cancelReason}</p>
      )}
      {actions && <div className="mt-4 flex flex-col gap-2 sm:flex-row">{actions}</div>}
    </article>
  );
}
