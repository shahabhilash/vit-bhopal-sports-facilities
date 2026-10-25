# Operations runbook

What runs on its own, how to tell whether it is working, and what to do when it is not.

## Scheduled jobs (pg_cron, inside Supabase)

| Job | Schedule | Function | What it does |
|---|---|---|---|
| `vitb-every-minute` | every minute | `run_scheduled_jobs()` | Releases no-shows (not checked in by start + 15:00), completes sessions still checked in after their slot, expires 10-minute waiting-list offers and passes them on. |
| `vitb-retention-hourly` | minute 17 of every hour | `run_retention_job()` | Deletes booking data past its retention period after folding it into `daily_usage_stats`; removes inactive passes, closed waiting-list entries older than 10 days, and scan-log rows older than 90 days. |
| Orphan photo sweep | every 6 hours, in the API | `cleanupOrphanPhotos()` | Removes issue photos in storage that no report points to (failed or abandoned uploads), older than a day. |

The turf **Friday 12:00 IST release needs no job**: the booking function compares the current IST time with each date's release instant, so the release cannot be missed or run twice.

Every job is idempotent: running it twice, late, or on two instances at once does nothing extra.

### Checking them

```sql
select jobname, schedule, active from cron.job;
```

```sql
select job, started_at, finished_at, ok, details
from public.job_runs order by started_at desc limit 20;
```

The admin dashboard shows the same status at the top of **Sports office → Overview**.

### Monitoring and alerts

Point an uptime monitor (for example UptimeRobot or Better Stack) at the API:

```
GET https://<api-host>/health/jobs
```

It returns **200** while the per-minute job succeeded in the last 5 minutes, retention succeeded in the last 2 hours, and nothing failed in the last hour. Otherwise it returns **503**. It needs no sign-in and reveals only timestamps and a failure count. Alert after two consecutive failures.

Also monitor `GET /health` (API up) and the Vercel site itself.

### If a job is failing

1. Read the error: `select details from public.job_runs where ok = false order by started_at desc limit 5;`
2. If pg_cron is not running jobs at all, check **Database → Extensions → pg_cron** is enabled and `cron.job` lists both jobs. Re-create a missing one:

   ```sql
   select cron.schedule('vitb-every-minute', '* * * * *', 'select public.run_scheduled_jobs()');
   ```

   ```sql
   select cron.schedule('vitb-retention-hourly', '17 * * * *', 'select public.run_retention_job()');
   ```

3. A job can be run by hand at any time; it only does what is due: `select public.run_scheduled_jobs();`
4. While the per-minute job is down, no-shows are not released and waiting-list offers do not expire. Bookings, cancellations and check-ins still work, and every booking rule is still enforced.

## Data retention (decision Q14)

| Data | Kept until |
|---|---|
| Completed bookings (and their players and pass) | 10 days after checkout |
| Cancelled and no-show bookings | 10 days after the slot ended |
| Closed waiting-list entries | 10 days after closing |
| QR passes | removed as soon as the booking is no longer active |
| Check-in scan log (ids only) | 90 days |
| Usage statistics (`daily_usage_stats`) | kept; counts only, no people |
| Feedback and issue photos | kept; unlinked from the deleted booking |
| Profiles and roles | until the account is deleted |
| Job log | 14 days |

Confirm these periods against the institute's records policy before launch; they are set in `run_retention()`.

## Friday turf release checklist

- The day before: `/health/jobs` is green, and a test turf booking on staging succeeded.
- Leapcell: at least one API instance kept warm; instance limits checked against the load test (Phase 8).
- Supabase: connection pooling on; no long-running admin queries scheduled at noon.
- After noon: watch the API logs for 5xx responses and Supabase for connection saturation.

## Accounts

- First sports administrator: see [ROLES.md](ROLES.md).
- Guards: granted and removed from **Sports office → Staff**.
