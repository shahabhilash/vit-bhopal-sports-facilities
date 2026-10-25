-- =============================================================================
-- Phase 7: data retention, anonymous usage history, and job monitoring.
--
-- Retention (decision Q14), run hourly:
--   * completed bookings: deleted 10 days after checkout;
--   * cancelled and no-show bookings: deleted 10 days after the slot ends.
--   Before deletion each booking is folded into daily_usage_stats (counts
--   per date, facility and slot; no people), so analytics keep their
--   history. Folding and deleting happen in one statement, so a booking is
--   counted exactly once even if the job runs twice or concurrently.
--   * Participants and QR passes go with their booking (cascade). Passes of
--     bookings that are no longer active are removed as soon as the job sees them.
--   * Closed waiting-list entries: deleted 10 days after closing.
--   * Check-in scan log (ids only): kept 90 days for audits.
--   * Feedback is never deleted here; its booking link is set to null.
--
-- Monitoring: every run is logged in job_runs (with the job name).
-- job_heartbeat() lets an uptime monitor see, without signing in, whether the
-- per-minute job has succeeded recently; it reveals nothing else.
-- =============================================================================

alter table public.job_runs add column job text not null default 'every_minute';
create index job_runs_job_idx on public.job_runs (job, started_at desc);

create table public.daily_usage_stats (
  slot_date         date not null,
  facility_code     text not null references public.facilities (code),
  slot_index        smallint not null references public.time_slots (slot_index),
  bookings          integer not null default 0,
  attended          integer not null default 0,
  no_shows          integer not null default 0,
  cancellations     integer not null default 0,
  players_attended  integer not null default 0,
  primary key (slot_date, facility_code, slot_index)
);

alter table public.daily_usage_stats enable row level security;
create policy daily_usage_stats_admin on public.daily_usage_stats
  for select to authenticated using ((select public.has_role('sports_admin')));
revoke all on public.daily_usage_stats from anon, authenticated;
grant select on public.daily_usage_stats to authenticated;

-- ---------------------------------------------------------------------------
-- Retention
-- ---------------------------------------------------------------------------
create function public.run_retention()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  _cutoff   timestamptz := public.app_now() - interval '10 days';
  _bookings integer;
  _passes   integer;
  _waitlist integer;
  _events   integer;
begin
  with doomed as (
    select b.*
    from public.bookings b
    where (b.status = 'completed' and coalesce(b.checked_out_at, b.starts_at + interval '1 hour') < _cutoff)
       or (b.status in ('cancelled', 'no_show') and b.starts_at + interval '1 hour' < _cutoff)
    for update skip locked
  ),
  rolled as (
    insert into public.daily_usage_stats as s
      (slot_date, facility_code, slot_index, bookings, attended, no_shows, cancellations, players_attended)
    select slot_date, facility_code, slot_index,
      count(*) filter (where status <> 'cancelled'),
      count(*) filter (where checked_in_at is not null),
      count(*) filter (where status = 'no_show'),
      count(*) filter (where status = 'cancelled'),
      coalesce(sum(participant_count) filter (where checked_in_at is not null), 0)
    from doomed
    group by slot_date, facility_code, slot_index
    on conflict (slot_date, facility_code, slot_index) do update set
      bookings = s.bookings + excluded.bookings,
      attended = s.attended + excluded.attended,
      no_shows = s.no_shows + excluded.no_shows,
      cancellations = s.cancellations + excluded.cancellations,
      players_attended = s.players_attended + excluded.players_attended
    returning 1
  ),
  deleted as (
    delete from public.bookings b using doomed d where b.id = d.id
    returning 1
  )
  select count(*) into _bookings from deleted;

  delete from public.booking_passes p
  using public.bookings b
  where b.id = p.booking_id and b.status not in ('confirmed', 'checked_in');
  get diagnostics _passes = row_count;

  delete from public.waitlist_entries
  where status not in ('waiting', 'offered') and coalesce(closed_at, created_at) < _cutoff;
  get diagnostics _waitlist = row_count;

  delete from public.check_in_events where created_at < public.app_now() - interval '90 days';
  get diagnostics _events = row_count;

  return jsonb_build_object('bookings', _bookings, 'passes', _passes, 'waitlist', _waitlist, 'scanLog', _events);
end;
$$;

-- Hourly wrapper that records the outcome for monitoring.
create function public.run_retention_job()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  _run     bigint;
  _details jsonb;
  _ok      boolean := true;
begin
  insert into public.job_runs (job) values ('retention') returning id into _run;
  begin
    _details := public.run_retention();
  exception when others then
    _ok := false;
    _details := jsonb_build_object('error', sqlerrm);
  end;
  update public.job_runs set finished_at = clock_timestamp(), ok = _ok, details = _details where id = _run;
  return _details || jsonb_build_object('ok', _ok);
end;
$$;

-- Issue photos that no report points to (for example after a failed upload),
-- older than a day. The API removes them through the storage API, which is
-- the only supported way to delete stored files.
create function public.orphan_feedback_photos(p_limit integer)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    return '{}';
  end if;
  -- Resolved only when run, so databases without Supabase Storage never reach it.
  return coalesce((
    select array_agg(o.name)
    from (
      select so.name
      from storage.objects so
      where so.bucket_id = 'feedback-photos'
        and so.created_at < public.app_now() - interval '1 day'
        and not exists (select 1 from public.facility_feedback f where f.photo_path = so.name)
      order by so.created_at
      limit least(greatest(coalesce(p_limit, 100), 1), 1000)
    ) o
  ), '{}');
end;
$$;

-- ---------------------------------------------------------------------------
-- Monitoring
-- ---------------------------------------------------------------------------
create function public.job_heartbeat()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'lastOkAt', (select public.iso_utc(max(finished_at)) from public.job_runs where job = 'every_minute' and ok),
    'lastRetentionOkAt', (select public.iso_utc(max(finished_at)) from public.job_runs where job = 'retention' and ok),
    'recentFailures', (select count(*) from public.job_runs where ok = false and started_at > public.app_now() - interval '1 hour')
  )
$$;

create function public.admin_job_runs()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'job', r.job, 'startedAt', public.iso_utc(r.started_at), 'finishedAt', public.iso_utc(r.finished_at),
      'ok', r.ok, 'details', r.details
    ) order by r.started_at desc), '[]'::jsonb)
    from (
      (select * from public.job_runs where ok = false order by started_at desc limit 10)
      union
      (select * from public.job_runs order by started_at desc limit 10)
    ) r
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Analytics over live bookings plus rolled-up history. Every booking is in
-- exactly one of the two, so totals do not change when retention runs.
-- ---------------------------------------------------------------------------
create or replace function public.admin_analytics(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _days integer;
begin
  perform public.require_admin();
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 91 then
    raise exception 'Choose a date range of up to 92 days.' using errcode = 'VB005';
  end if;
  _days := p_to - p_from + 1;

  return (
    with usage as (
      select b.slot_date, b.facility_code, b.slot_index,
        count(*) filter (where b.status <> 'cancelled') as bookings,
        count(*) filter (where b.checked_in_at is not null) as attended,
        count(*) filter (where b.status = 'no_show') as no_shows,
        count(*) filter (where b.status = 'cancelled') as cancellations,
        coalesce(sum(b.participant_count) filter (where b.checked_in_at is not null), 0) as players_attended
      from public.bookings b
      where b.slot_date between p_from and p_to
      group by 1, 2, 3
      union all
      select s.slot_date, s.facility_code, s.slot_index, s.bookings, s.attended, s.no_shows, s.cancellations, s.players_attended
      from public.daily_usage_stats s
      where s.slot_date between p_from and p_to
    )
    select jsonb_build_object(
      'from', p_from,
      'to', p_to,
      'byFacility', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'facility', f.code,
          'bookings', coalesce(u.bookings, 0),
          'attended', coalesce(u.attended, 0),
          'noShows', coalesce(u.no_shows, 0),
          'cancellations', coalesce(u.cancellations, 0),
          'playersAttended', coalesce(u.players_attended, 0),
          'slotCapacity', (select count(*) from public.facility_resources r where r.facility_code = f.code and r.is_active) * 12 * _days
        ) order by f.sort_order), '[]'::jsonb)
        from public.facilities f
        left join (
          select facility_code, sum(bookings) as bookings, sum(attended) as attended, sum(no_shows) as no_shows,
                 sum(cancellations) as cancellations, sum(players_attended) as players_attended
          from usage group by facility_code
        ) u on u.facility_code = f.code
        where f.bookable
      ),
      'daily', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'date', d::date,
          'bookings', coalesce((select sum(bookings) from usage where slot_date = d::date), 0),
          'attended', coalesce((select sum(attended) from usage where slot_date = d::date), 0)
        ) order by d), '[]'::jsonb)
        from generate_series(p_from, p_to, interval '1 day') as d
      ),
      'bySlot', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'slotIndex', t.slot_index,
          'bookings', coalesce((select sum(bookings) from usage where slot_index = t.slot_index), 0),
          'attended', coalesce((select sum(attended) from usage where slot_index = t.slot_index), 0)
        ) order by t.slot_index), '[]'::jsonb)
        from public.time_slots t
      ),
      'heatmap', (
        select coalesce(jsonb_agg(jsonb_build_object('weekday', h.dow, 'slotIndex', h.slot_index, 'attended', h.n)), '[]'::jsonb)
        from (
          select extract(dow from slot_date)::int as dow, slot_index, sum(attended) as n
          from usage
          group by 1, 2
          having sum(attended) > 0
        ) h
      )
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function
  public.run_retention(),
  public.run_retention_job(),
  public.orphan_feedback_photos(integer),
  public.job_heartbeat(),
  public.admin_job_runs()
  from public, anon, authenticated;

-- The heartbeat exposes only timestamps and a failure count.
grant execute on function public.job_heartbeat() to anon, authenticated;
grant execute on function public.admin_job_runs() to authenticated;
-- orphan_feedback_photos is called by the API with the service role only.
grant execute on function public.orphan_feedback_photos(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Schedule retention hourly (Supabase only).
-- ---------------------------------------------------------------------------
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('vitb-retention-hourly', '17 * * * *', 'select public.run_retention_job()');
  end if;
end
$do$;
