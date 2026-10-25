"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RefreshCw } from "lucide-react";
import { TIME_SLOTS, addDays, istDateString, type FacilityAnalytics } from "@vitb/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Notice, Skeleton } from "@/components/ui/feedback";
import { Input, Label } from "@/components/ui/field";
import { errorMessage } from "@/lib/api";
import { useAnalytics } from "@/lib/admin";
import { FACILITIES } from "@/lib/catalog";
import { formatDayMonth } from "@/lib/format";
import { cn } from "@/lib/utils";

const PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");
const shortTime = (index: number) => TIME_SLOTS[index - 1]!.label.split(" – ")[0]!.replace(":30", "").replace(" ", "");

function FacilityStats({ f }: { f: FacilityAnalytics }) {
  const rows: [string, string | number][] = [
    ["Bookings", f.bookings],
    ["Checked in", `${f.attended} (${pct(f.attended, f.bookings)})`],
    ["No-shows", f.noShows],
    ["Cancelled", f.cancellations],
    ["Players checked in", f.playersAttended],
    ["Slots booked", pct(f.bookings, f.slotCapacity)],
  ];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{FACILITIES[f.facility].rule.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-lg font-bold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

export function AdminOverview() {
  const today = istDateString();
  const [range, setRange] = useState({ from: addDays(today, -29), to: today });
  const { data, error, loading, refresh, refreshing } = useAnalytics(range.from, range.to);

  const max = Math.max(1, ...(data?.heatmap.map((h) => h.attended) ?? [1]));
  const cell = (weekday: number, slot: number) => data?.heatmap.find((h) => h.weekday === weekday && h.slotIndex === slot)?.attended ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Date range presets">
          {PRESETS.map((p) => {
            const active = range.to === today && range.from === addDays(today, -(p.days - 1));
            return (
              <Button
                key={p.days}
                variant={active ? "default" : "outline"}
                aria-pressed={active}
                onClick={() => setRange({ from: addDays(today, -(p.days - 1)), to: today })}
              >
                {p.label}
              </Button>
            );
          })}
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="range-from">From</Label>
            <Input id="range-from" type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="range-to">To</Label>
            <Input id="range-to" type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} />
          </div>
          <Button variant="ghost" size="icon" aria-label="Refresh" onClick={() => void refresh()} disabled={refreshing}>
            <RefreshCw className={cn(refreshing && "animate-spin")} aria-hidden />
          </Button>
        </div>
      </div>

      <Notice tone="info">
        &ldquo;Checked in&rdquo; counts guard scans, so it reflects who actually came. Bookings alone over-count the crowd,
        because of no-shows.
      </Notice>

      {error ? (
        <Notice tone="danger" title="Could not load analytics">
          {errorMessage(error)}
        </Notice>
      ) : loading || !data ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {data.byFacility.map((f) => (
              <FacilityStats key={f.facility} f={f} />
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bookings and check-ins per day</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.daily.map((d) => ({ ...d, day: formatDayMonth(d.date) }))} margin={{ left: -16, right: 8 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip cursor={{ fill: "hsl(var(--accent))" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="bookings" name="Bookings" fill="hsl(var(--brand))" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="attended" name="Checked in" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Busiest time slots</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.bySlot.map((s) => ({ ...s, time: shortTime(s.slotIndex) }))} margin={{ left: -16, right: 8 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} interval={0} angle={-35} textAnchor="end" height={40} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip cursor={{ fill: "hsl(var(--accent))" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="bookings" name="Bookings" fill="hsl(var(--brand))" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="attended" name="Checked in" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Check-ins by weekday and slot</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] border-separate border-spacing-1 text-center text-xs">
                  <caption className="sr-only">Number of check-ins for each weekday and time slot</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="w-12" />
                      {TIME_SLOTS.map((s) => (
                        <th key={s.index} scope="col" className="font-medium text-muted-foreground">
                          {shortTime(s.index)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ORDER.map((d) => (
                      <tr key={d}>
                        <th scope="row" className="text-left font-semibold">
                          {WEEKDAYS[d]}
                        </th>
                        {TIME_SLOTS.map((s) => {
                          const n = cell(d, s.index);
                          return (
                            <td
                              key={s.index}
                              className={cn("h-9 rounded tabular-nums", n / max > 0.6 && "text-primary-foreground font-semibold")}
                              style={{ backgroundColor: n ? `hsl(var(--primary) / ${0.12 + 0.88 * (n / max)})` : "hsl(var(--surface-sunken))" }}
                            >
                              {n || ""}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
