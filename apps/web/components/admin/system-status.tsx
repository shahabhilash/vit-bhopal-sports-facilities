"use client";
import { Activity } from "lucide-react";
import { Notice } from "@/components/ui/feedback";
import { useJobRuns } from "@/lib/admin";
import { formatInstant } from "@/lib/format";
import { useNow } from "@/lib/use-now";

/** Health of the scheduled jobs (no-show release, waiting-list offers, retention). */
export function SystemStatus() {
  const { data, error } = useJobRuns();
  const now = useNow();
  if (error || !data || !now) return null;

  const latest = (job: string) => data.find((r) => r.job === job && r.ok);
  const minute = latest("every_minute");
  const retention = latest("retention");
  const failure = data.find((r) => r.ok === false);
  const stale = !minute || now.getTime() - new Date(minute.startedAt).getTime() > 5 * 60_000;
  const failing = failure && now.getTime() - new Date(failure.startedAt).getTime() < 60 * 60_000;

  if (!stale && !failing) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Activity className="h-4 w-4 text-success" aria-hidden />
        Scheduled jobs are running. Last run {formatInstant(new Date(minute!.startedAt))}
        {retention ? `; data cleanup ${formatInstant(new Date(retention.startedAt))}` : ""}.
      </p>
    );
  }
  return (
    <Notice tone="danger" title="Scheduled jobs need attention">
      {stale
        ? "No-show release and waiting-list offers have not run in the last 5 minutes. Check pg_cron in Supabase."
        : `A job failed at ${formatInstant(new Date(failure!.startedAt))}: ${String((failure!.details as { error?: string } | null)?.error ?? "see job_runs")}`}
    </Notice>
  );
}
