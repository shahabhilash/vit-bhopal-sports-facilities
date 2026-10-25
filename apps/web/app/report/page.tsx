"use client";
import Link from "next/link";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { useMyBookings } from "@/lib/bookings";
import { useSessionStatus } from "@/lib/supabase/session";
import { BOOKABLE, FACILITIES } from "@/lib/catalog";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-card">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

export default function ReportPage() {
  const session = useSessionStatus();
  const bookings = useMyBookings(session).data ?? [];
  const completed = bookings.filter((b) => b.status === "completed");
  const cancelled = bookings.filter((b) => b.status === "cancelled").length;

  const bySport = BOOKABLE.map((code) => ({
    sport: FACILITIES[code].rule.name,
    sessions: completed.filter((b) => b.facility === code).length,
  }));
  const top = [...bySport].sort((a, b) => b.sessions - a.sessions)[0];

  return (
    <div className="container max-w-3xl py-6 sm:py-10">
      <Link href="/my-bookings" className="-ml-2 mb-2 inline-flex h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        My bookings
      </Link>
      <PageHeader title="Your activity" description="Completed sessions you booked or played in. Each slot is one hour." />

      {completed.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={BarChart3}
          title="No completed sessions yet"
          description="Sessions are counted here once they are completed."
          action={
            <Link href="/book" className={buttonVariants({ size: "lg" })}>
              Book a slot
            </Link>
          }
        />
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Sessions" value={completed.length} />
            <Stat label="Hours played" value={completed.length} />
            <Stat label="Most played" value={top && top.sessions > 0 ? top.sport : "—"} />
            <Stat label="Cancelled" value={cancelled} />
          </div>
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Sessions by sport</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48" role="img" aria-label={bySport.map((s) => `${s.sport}: ${s.sessions}`).join(", ")}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bySport} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="sport" width={84} tick={{ fontSize: 13 }} />
                    <Tooltip cursor={{ fill: "hsl(var(--accent))" }} />
                    <Bar dataKey="sessions" name="Sessions" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
