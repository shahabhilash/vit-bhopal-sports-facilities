-- =============================================================================
-- Phase 5: booking passes (QR), guard check-in, checkout with feedback,
-- no-show release, waiting list with timed offers, and scheduled jobs.
--
-- Lifecycle (all times IST, read through app_now()):
--   confirmed --guard scan, start-10m .. start+15m--> checked_in
--   confirmed --no check-in by start+15m (job)-----> no_show   (slot freed)
--   checked_in --student checks out, or slot end (job)--> completed
--
-- Waiting list (decision Q10):
--   A slot freed by cancellation at least 2 hours before its start is offered
--   to the earliest waiting student for 10 minutes, and held for them. If the
--   offer expires or is declined it moves to the next student. Later
--   releases (including no-shows) are simply open to everyone.
--
-- Every write that can free, hold or take a slot first takes
-- lock_slot(resource, date, slot), so cancel/offer/book/accept on the same
-- slot run one at a time. Unique indexes remain the final guarantee.
--
-- New error code: VB011 OFFER_EXPIRED.
-- =============================================================================

create type public.waitlist_status as enum ('waiting', 'offered', 'accepted', 'expired', 'left');
create type public.feedback_rating as enum ('good', 'issue');
create type public.feedback_status as enum ('open', 'in_progress', 'resolved');

create function public.lock_slot(p_resource uuid, p_date date, p_slot smallint)
returns void
language sql
volatile
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended(p_resource::text || ':' || p_date::text || ':' || p_slot::text, 0))
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One unguessable token per booking (about 244 random bits). The QR code
-- carries only "VITB1.<token>": no personal data and no booking id.
create table public.booking_passes (
  booking_id  uuid primary key references public.bookings (id) on delete cascade,
  token       text not null unique check (token ~ '^[0-9a-f]{64}$'),
  created_at  timestamptz not null default now()
);

-- Scan log for audits and analytics. Holds ids only, no names.
create table public.check_in_events (
  id          bigint generated always as identity primary key,
  booking_id  uuid references public.bookings (id) on delete set null,
  guard_id    uuid references public.profiles (id) on delete set null,
  result      text not null,
  created_at  timestamptz not null default now()
);
create index check_in_events_created_idx on public.check_in_events (created_at desc);

create table public.waitlist_entries (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles (id) on delete cascade,
  facility_code       text not null references public.facilities (code),
  resource_id         uuid not null references public.facility_resources (id),
  slot_date           date not null,
  slot_index          smallint not null references public.time_slots (slot_index),
  starts_at           timestamptz not null,
  participant_count   smallint check (participant_count between 1 and 26),
  participant_reg_nos text[],
  status              public.waitlist_status not null default 'waiting',
  created_at          timestamptz not null default now(),
  offered_at          timestamptz,
  offer_expires_at    timestamptz,
  booking_id          uuid references public.bookings (id) on delete set null,
  closed_at           timestamptz,
  check (status <> 'offered' or offer_expires_at is not null)
);
create unique index waitlist_one_active_uq on public.waitlist_entries (owner_id, resource_id, slot_date, slot_index)
  where status in ('waiting', 'offered');
-- At most one live offer per slot.
create unique index waitlist_one_offer_uq on public.waitlist_entries (resource_id, slot_date, slot_index)
  where status = 'offered';
create index waitlist_queue_idx on public.waitlist_entries (resource_id, slot_date, slot_index, created_at, id)
  where status = 'waiting';
create index waitlist_offer_expiry_idx on public.waitlist_entries (offer_expires_at) where status = 'offered';
create index waitlist_owner_idx on public.waitlist_entries (owner_id, created_at desc);

-- Kept independently of bookings: deleting a booking (retention) never
-- deletes its feedback.
create table public.facility_feedback (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid references public.bookings (id) on delete set null,
  author_id      uuid references public.profiles (id) on delete set null,
  facility_code  text not null references public.facilities (code),
  resource_name  text,
  slot_date      date not null,
  slot_index     smallint,
  rating         public.feedback_rating not null,
  description    text check (description is null or char_length(btrim(description)) between 10 and 1000),
  photo_path     text,
  status         public.feedback_status not null default 'open',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (rating = 'good' or description is not null)
);
create unique index facility_feedback_booking_uq on public.facility_feedback (booking_id) where booking_id is not null;
create index facility_feedback_triage_idx on public.facility_feedback (status, created_at desc);

-- Scheduled job log, for monitoring.
create table public.job_runs (
  id           bigint generated always as identity primary key,
  started_at   timestamptz not null default clock_timestamp(),
  finished_at  timestamptz,
  ok           boolean,
  details      jsonb
);
create index job_runs_started_idx on public.job_runs (started_at desc);

-- ---------------------------------------------------------------------------
-- Waiting-list offers
-- ---------------------------------------------------------------------------

-- Offers the slot to the earliest waiting student if it is free, not
-- blocked, not already offered, and at least 2 hours away. The caller holds
-- lock_slot. Returns the entry offered, or null.
create function public.offer_next(p_resource uuid, p_date date, p_slot smallint)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  _now      timestamptz := public.app_now();
  _resource public.facility_resources;
  _starts   timestamptz;
  _entry    uuid;
begin
  select * into _resource from public.facility_resources where id = p_resource;
  select (p_date + s.start_time) at time zone 'Asia/Kolkata' into _starts
  from public.time_slots s where s.slot_index = p_slot;

  if _starts - _now < interval '2 hours' then
    return null;
  end if;
  if exists (select 1 from public.bookings b
             where b.resource_id = p_resource and b.slot_date = p_date and b.slot_index = p_slot
               and b.status in ('confirmed', 'checked_in')) then
    return null;
  end if;
  if exists (select 1 from public.waitlist_entries w
             where w.resource_id = p_resource and w.slot_date = p_date and w.slot_index = p_slot
               and w.status = 'offered') then
    return null;
  end if;
  if exists (select 1 from public.facility_blocks fb
             where fb.facility_code = _resource.facility_code
               and (fb.resource_id is null or fb.resource_id = p_resource)
               and p_date between fb.start_date and fb.end_date
               and (fb.slot_indexes is null or p_slot = any (fb.slot_indexes))) then
    return null;
  end if;

  select w.id into _entry
  from public.waitlist_entries w
  where w.resource_id = p_resource and w.slot_date = p_date and w.slot_index = p_slot and w.status = 'waiting'
  order by w.created_at, w.id
  limit 1
  for update skip locked;

  if _entry is null then
    return null;
  end if;

  update public.waitlist_entries
  set status = 'offered', offered_at = _now, offer_expires_at = _now + interval '10 minutes'
  where id = _entry;
  return _entry;
end;
$$;

-- ---------------------------------------------------------------------------
-- Updated Phase 4 functions: slot lock, waiting-list hold, offers on cancel
-- ---------------------------------------------------------------------------
create or replace function public.create_booking(
  p_resource_id        uuid,
  p_slot_date          date,
  p_slot_index         smallint,
  p_participant_count  smallint,
  p_participant_reg_nos text[],
  p_idempotency_key    uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  _uid        uuid := (select auth.uid());
  _now        timestamptz := public.app_now();
  _today      date := public.ist_today();
  _existing   public.bookings;
  _facility   public.facilities;
  _resource   public.facility_resources;
  _slot       public.time_slots;
  _starts_at  timestamptz;
  _block      public.facility_blocks;
  _owner_reg  text;
  _reg_nos    text[];
  _dupes      text[];
  _bad        text[];
  _missing    text[];
  _people     uuid[];
  _count      smallint;
  _booking    public.bookings;
  _constraint text;
begin
  if _uid is null then
    raise exception 'Sign in to book.' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'Missing idempotency key.' using errcode = 'VB005';
  end if;

  -- Retried request: return the original outcome.
  select * into _existing from public.bookings where owner_id = _uid and idempotency_key = p_idempotency_key;
  if found then
    return public.booking_json(_existing);
  end if;

  if not exists (select 1 from auth.users where id = _uid and email_confirmed_at is not null) then
    raise exception 'Verify your email address before booking.' using errcode = 'VB006';
  end if;

  select * into _resource from public.facility_resources where id = p_resource_id and is_active;
  if not found then
    raise exception 'That court or area does not exist.' using errcode = 'VB008';
  end if;
  select * into _facility from public.facilities where code = _resource.facility_code;
  if not _facility.bookable then
    raise exception '% cannot be booked online.', _facility.name using errcode = 'VB005';
  end if;

  select * into _slot from public.time_slots where slot_index = p_slot_index;
  if not found or p_slot_date is null then
    raise exception 'Choose one of the listed time slots.' using errcode = 'VB005';
  end if;

  _starts_at := (p_slot_date + _slot.start_time) at time zone 'Asia/Kolkata';

  -- Serialise every booking, cancellation and waiting-list offer for this slot.
  perform public.lock_slot(_resource.id, p_slot_date, p_slot_index);
  if _starts_at <= _now then
    raise exception 'This slot has already started. Choose a later time.' using errcode = 'VB002';
  end if;

  if _facility.release_rule = 'rolling' then
    if p_slot_date > _today + (_facility.booking_horizon_days - 1) then
      raise exception '% can be booked up to % days ahead.', _facility.name, _facility.booking_horizon_days
        using errcode = 'VB002';
    end if;
  elsif public.turf_release_at(p_slot_date) > _now then
    raise exception 'Turf bookings for this week open on % at 12:00 PM.',
      to_char(public.turf_week_start(p_slot_date) - 1, 'Dy DD Mon') using errcode = 'VB002';
  end if;

  select * into _block
  from public.facility_blocks fb
  where fb.facility_code = _facility.code
    and (fb.resource_id is null or fb.resource_id = _resource.id)
    and p_slot_date between fb.start_date and fb.end_date
    and (fb.slot_indexes is null or p_slot_index = any (fb.slot_indexes))
  limit 1;
  if found then
    raise exception '%.', public.block_label(_block.reason) using errcode = 'VB003',
      detail = jsonb_build_object('reason', _block.reason)::text;
  end if;

  -- Participants
  if _facility.code = 'turf' then
    select reg_no into _owner_reg from public.profiles where id = _uid;
    if _owner_reg is null then
      raise exception 'Add your registration number on the Account page before booking the turf.' using errcode = 'VB007';
    end if;

    select coalesce(array_agg(n order by ord), '{}') into _reg_nos
    from (
      select upper(regexp_replace(x, '\s', '', 'g')) as n, min(ord) as ord
      from unnest(coalesce(p_participant_reg_nos, '{}')) with ordinality as t(x, ord)
      where btrim(x) <> ''
      group by 1
    ) s;

    select coalesce(array_agg(n), '{}') into _dupes
    from (
      select upper(regexp_replace(x, '\s', '', 'g')) as n
      from unnest(coalesce(p_participant_reg_nos, '{}')) as t(x)
      where btrim(x) <> ''
      group by 1
      having count(*) > 1
    ) d;
    if cardinality(_dupes) > 0 then
      raise exception 'Each player can be listed only once.' using errcode = 'VB005',
        detail = jsonb_build_object('duplicates', _dupes)::text;
    end if;

    select coalesce(array_agg(n), '{}') into _bad
    from unnest(_reg_nos) as n
    where n !~ '^[0-9]{2}[A-Z]{3,4}[0-9]{4,5}$';
    if cardinality(_bad) > 0 then
      raise exception 'Some registration numbers are not valid.' using errcode = 'VB005',
        detail = jsonb_build_object('invalid', _bad)::text;
    end if;

    _count := cardinality(_reg_nos);
    if _count < _facility.min_participants or _count > _facility.max_participants then
      raise exception 'Turf bookings need % to % players; you listed %.',
        _facility.min_participants, _facility.max_participants, _count using errcode = 'VB005';
    end if;
    if not (_owner_reg = any (_reg_nos)) then
      raise exception 'Include your own registration number in the player list.' using errcode = 'VB005';
    end if;

    select coalesce(array_agg(p.id), '{}') into _people
    from public.profiles p
    join auth.users u on u.id = p.id and u.email_confirmed_at is not null
    where p.reg_no = any (_reg_nos);

    select coalesce(array_agg(n), '{}') into _missing
    from unnest(_reg_nos) as n
    where not exists (
      select 1 from public.profiles p join auth.users u on u.id = p.id and u.email_confirmed_at is not null
      where p.reg_no = n
    );
    if cardinality(_missing) > 0 then
      raise exception 'Every player needs a verified account on this site with their registration number saved.'
        using errcode = 'VB005', detail = jsonb_build_object('unregistered', _missing)::text;
    end if;
  else
    _count := p_participant_count;
    if _count is null or _count < _facility.min_participants or _count > _facility.max_participants then
      raise exception '% bookings need % to % players.', _facility.name, _facility.min_participants, _facility.max_participants
        using errcode = 'VB005';
    end if;
    _people := array[_uid];
  end if;

  -- A live waiting-list offer holds the slot for that student only.
  if exists (
    select 1 from public.waitlist_entries w
    where w.resource_id = _resource.id and w.slot_date = p_slot_date and w.slot_index = p_slot_index
      and w.status = 'offered' and w.offer_expires_at > _now and w.owner_id <> _uid
  ) then
    raise exception 'This slot is being offered to the next student on the waiting list.' using errcode = 'VB001';
  end if;

  begin
    insert into public.bookings (
      owner_id, facility_code, resource_id, slot_date, slot_index, starts_at, week_start,
      participant_count, idempotency_key
    ) values (
      _uid, _facility.code, _resource.id, p_slot_date, p_slot_index, _starts_at,
      public.turf_week_start(p_slot_date), _count, p_idempotency_key
    )
    returning * into _booking;

    insert into public.booking_participants (booking_id, profile_id, slot_date, slot_index, is_owner)
    select _booking.id, person, p_slot_date, p_slot_index, person = _uid
    from unnest(_people) as person;
  exception when unique_violation then
    get stacked diagnostics _constraint = constraint_name;
    case _constraint
      when 'bookings_active_slot_uq' then
        raise exception 'Someone else just booked this slot. Choose another time.' using errcode = 'VB001';
      when 'bookings_owner_day_uq' then
        raise exception 'You already have a % booking on this day.', lower(_facility.name) using errcode = 'VB004';
      when 'bookings_owner_turf_week_uq' then
        raise exception 'You already have a turf booking this week.' using errcode = 'VB004';
      when 'participants_active_slot_uq' then
        raise exception 'You or one of your players already has a booking at this time.' using errcode = 'VB010';
      when 'bookings_owner_key_uq' then
        -- A concurrent retry with the same key won the race.
        select * into _existing from public.bookings where owner_id = _uid and idempotency_key = p_idempotency_key;
        return public.booking_json(_existing);
      else
        raise;
    end case;
  end;

  return public.booking_json(_booking);
end;
$$;

create or replace function public.cancel_booking(p_booking_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  _uid     uuid := (select auth.uid());
  _booking public.bookings;
begin
  if _uid is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;

  select * into _booking from public.bookings where id = p_booking_id and owner_id = _uid for update;
  if not found then
    raise exception 'Booking not found.' using errcode = 'VB008';
  end if;
  perform public.lock_slot(_booking.resource_id, _booking.slot_date, _booking.slot_index);

  if _booking.status = 'cancelled' then
    return public.booking_json(_booking);
  end if;
  if _booking.status <> 'confirmed' then
    raise exception 'Only upcoming bookings can be cancelled.' using errcode = 'VB009';
  end if;
  if _booking.starts_at - public.app_now() <= interval '1 hour' then
    raise exception 'Bookings can be cancelled until 1 hour before the start.' using errcode = 'VB009';
  end if;

  update public.bookings
  set status = 'cancelled', cancelled_at = public.app_now()
  where id = _booking.id
  returning * into _booking;

  update public.booking_participants set active = false where booking_id = _booking.id;

  -- Decision Q10: releases at least 2 hours ahead go to the waiting list first.
  if _booking.starts_at - public.app_now() >= interval '2 hours' then
    perform public.offer_next(_booking.resource_id, _booking.slot_date, _booking.slot_index);
  end if;

  return public.booking_json(_booking);
end;
$$;

create or replace function public.get_availability(p_facility text, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 13 then
    raise exception 'Choose a date range of up to 14 days.' using errcode = 'VB005';
  end if;

  return coalesce((
    select jsonb_agg(e order by e ->> 'date', (e ->> 'slotIndex')::int)
    from (
      select jsonb_build_object(
        'resourceId', b.resource_id, 'date', b.slot_date, 'slotIndex', b.slot_index, 'state', 'booked'
      ) as e
      from public.bookings b
      where b.facility_code = p_facility
        and b.slot_date between p_from and p_to
        and b.status in ('confirmed', 'checked_in')
      union all
      select jsonb_build_object(
        'resourceId', r.id, 'date', d::date, 'slotIndex', s.slot_index, 'state', 'blocked',
        'label', public.block_label(fb.reason)
      )
      from public.facility_blocks fb
      join public.facility_resources r
        on r.facility_code = fb.facility_code and (fb.resource_id is null or fb.resource_id = r.id)
      cross join generate_series(greatest(fb.start_date, p_from), least(fb.end_date, p_to), interval '1 day') as d
      join public.time_slots s on fb.slot_indexes is null or s.slot_index = any (fb.slot_indexes)
      where fb.facility_code = p_facility
        and fb.start_date <= p_to and fb.end_date >= p_from
      union all
      select jsonb_build_object(
        'resourceId', w.resource_id, 'date', w.slot_date, 'slotIndex', w.slot_index, 'state', 'booked',
        'label', 'Held for the waiting list'
      )
      from public.waitlist_entries w
      where w.facility_code = p_facility
        and w.slot_date between p_from and p_to
        and w.status = 'offered'
        and w.offer_expires_at > public.app_now()
    ) entries
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Passes and check-in
-- ---------------------------------------------------------------------------

-- The caller's pass for a booking they own or play in.
create function public.my_booking_pass(p_booking_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  _uid     uuid := (select auth.uid());
  _booking public.bookings;
  _token   text;
begin
  select * into _booking from public.bookings b
  where b.id = p_booking_id
    and (b.owner_id = _uid or exists (
      select 1 from public.booking_participants p where p.booking_id = b.id and p.profile_id = _uid));
  if not found then
    raise exception 'Booking not found.' using errcode = 'VB008';
  end if;
  if _booking.status not in ('confirmed', 'checked_in') then
    raise exception 'Passes are only available for upcoming bookings.' using errcode = 'VB009';
  end if;

  insert into public.booking_passes (booking_id, token)
  values (_booking.id, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  on conflict (booking_id) do nothing;

  select token into _token from public.booking_passes where booking_id = _booking.id;
  return jsonb_build_object('bookingId', _booking.id, 'code', 'VITB1.' || _token);
end;
$$;

-- Guard scan. Returns an outcome object rather than raising, so every scan
-- (including invalid ones) is logged.
create function public.guard_check_in(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  _uid     uuid := (select auth.uid());
  _now     timestamptz := public.app_now();
  _token   text := lower(regexp_replace(btrim(coalesce(p_code, '')), '^VITB1\.', '', 'i'));
  _booking public.bookings;
  _result  text;
  _owner   public.profiles;
begin
  if _uid is null or not (public.has_role('guard') or public.has_role('sports_admin')) then
    raise exception 'Only facility guards can check bookings in.' using errcode = '42501';
  end if;

  if _token ~ '^[0-9a-f]{64}$' then
    select b.* into _booking
    from public.booking_passes p
    join public.bookings b on b.id = p.booking_id
    where p.token = _token
    for update of b;
  end if;

  if _booking.id is null then
    _result := 'invalid';
  elsif _booking.status = 'cancelled' then
    _result := 'cancelled';
  elsif _booking.status = 'checked_in' then
    _result := 'already_checked_in';
  elsif _booking.status = 'completed' then
    _result := 'already_completed';
  elsif _booking.status = 'no_show' then
    _result := 'expired';
  elsif _booking.slot_date <> public.ist_today() then
    _result := 'wrong_day';
  elsif _now < _booking.starts_at - interval '10 minutes' then
    _result := 'too_early';
  elsif _now > _booking.starts_at + interval '15 minutes' then
    _result := 'expired';
  else
    update public.bookings
    set status = 'checked_in', checked_in_at = _now
    where id = _booking.id and status = 'confirmed'
    returning * into _booking;
    _result := 'checked_in';
  end if;

  insert into public.check_in_events (booking_id, guard_id, result) values (_booking.id, _uid, _result);

  if _booking.id is null then
    return jsonb_build_object('result', _result);
  end if;

  select * into _owner from public.profiles where id = _booking.owner_id;
  return jsonb_build_object(
    'result', _result,
    'booking', jsonb_build_object(
      'facility', _booking.facility_code,
      'resource', (select name from public.facility_resources where id = _booking.resource_id),
      'date', _booking.slot_date,
      'slotIndex', _booking.slot_index,
      'startsAt', public.iso_utc(_booking.starts_at),
      'participants', _booking.participant_count,
      'ownerName', _owner.full_name,
      'ownerRegNo', _owner.reg_no
    ),
    'checkedInAt', public.iso_utc(_booking.checked_in_at),
    'opensAt', public.iso_utc(_booking.starts_at - interval '10 minutes'),
    'closesAt', public.iso_utc(_booking.starts_at + interval '15 minutes')
  );
end;
$$;

create function public.check_out(p_booking_id uuid, p_rating public.feedback_rating, p_description text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  _uid     uuid := (select auth.uid());
  _booking public.bookings;
  _desc    text := nullif(btrim(coalesce(p_description, '')), '');
begin
  select * into _booking from public.bookings where id = p_booking_id and owner_id = _uid for update;
  if not found then
    raise exception 'Booking not found.' using errcode = 'VB008';
  end if;
  if _booking.status <> 'checked_in' then
    raise exception 'Only a checked-in session can be checked out.' using errcode = 'VB009';
  end if;
  if p_rating is null then
    raise exception 'Tell us how the session went.' using errcode = 'VB005';
  end if;
  if p_rating = 'issue' and (_desc is null or char_length(_desc) < 10) then
    raise exception 'Describe the problem in at least 10 characters.' using errcode = 'VB005';
  end if;
  if _desc is not null and char_length(_desc) > 1000 then
    raise exception 'Keep the description under 1000 characters.' using errcode = 'VB005';
  end if;
  if _desc is not null and char_length(_desc) < 10 then
    _desc := null; -- a short note on a "good" rating is dropped rather than rejected
  end if;

  update public.bookings
  set status = 'completed', checked_out_at = public.app_now()
  where id = _booking.id
  returning * into _booking;

  insert into public.facility_feedback (booking_id, author_id, facility_code, resource_name, slot_date, slot_index, rating, description)
  values (
    _booking.id, _uid, _booking.facility_code,
    (select name from public.facility_resources where id = _booking.resource_id),
    _booking.slot_date, _booking.slot_index, p_rating, _desc
  );

  return public.booking_json(_booking);
end;
$$;

-- ---------------------------------------------------------------------------
-- Waiting list
-- ---------------------------------------------------------------------------

create function public.waitlist_json(w public.waitlist_entries)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', w.id,
    'facility', w.facility_code,
    'resourceId', w.resource_id,
    'resource', (select name from public.facility_resources where id = w.resource_id),
    'date', w.slot_date,
    'slotIndex', w.slot_index,
    'startsAt', public.iso_utc(w.starts_at),
    'participants', w.participant_count,
    'status', w.status,
    'position', case when w.status = 'waiting' then (
      select count(*) + 1 from public.waitlist_entries o
      where o.resource_id = w.resource_id and o.slot_date = w.slot_date and o.slot_index = w.slot_index
        and o.status = 'waiting' and (o.created_at, o.id) < (w.created_at, w.id)
    ) end,
    'offerExpiresAt', case when w.status = 'offered' then public.iso_utc(w.offer_expires_at) end,
    'bookingId', w.booking_id,
    'createdAt', public.iso_utc(w.created_at)
  )
$$;

create function public.join_waitlist(
  p_resource_id         uuid,
  p_slot_date           date,
  p_slot_index          smallint,
  p_participant_count   smallint,
  p_participant_reg_nos text[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  _uid       uuid := (select auth.uid());
  _now       timestamptz := public.app_now();
  _resource  public.facility_resources;
  _facility  public.facilities;
  _slot      public.time_slots;
  _starts    timestamptz;
  _owner_reg text;
  _reg_nos   text[];
  _count     smallint;
  _entry     public.waitlist_entries;
begin
  if _uid is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = _uid and email_confirmed_at is not null) then
    raise exception 'Verify your email address first.' using errcode = 'VB006';
  end if;

  select * into _resource from public.facility_resources where id = p_resource_id and is_active;
  if not found then
    raise exception 'That court or area does not exist.' using errcode = 'VB008';
  end if;
  select * into _facility from public.facilities where code = _resource.facility_code;
  select * into _slot from public.time_slots where slot_index = p_slot_index;
  if not _facility.bookable or _slot.slot_index is null or p_slot_date is null then
    raise exception 'Choose one of the listed time slots.' using errcode = 'VB005';
  end if;

  _starts := (p_slot_date + _slot.start_time) at time zone 'Asia/Kolkata';
  if _starts - _now < interval '2 hours' then
    raise exception 'Waiting lists close 2 hours before the start.' using errcode = 'VB002';
  end if;
  if _facility.release_rule = 'rolling' and p_slot_date > public.ist_today() + (_facility.booking_horizon_days - 1) then
    raise exception '% can be booked up to % days ahead.', _facility.name, _facility.booking_horizon_days using errcode = 'VB002';
  end if;
  if _facility.release_rule = 'weekly_friday_noon' and public.turf_release_at(p_slot_date) > _now then
    raise exception 'This turf week has not opened yet.' using errcode = 'VB002';
  end if;
  if exists (select 1 from public.facility_blocks fb
             where fb.facility_code = _facility.code
               and (fb.resource_id is null or fb.resource_id = _resource.id)
               and p_slot_date between fb.start_date and fb.end_date
               and (fb.slot_indexes is null or p_slot_index = any (fb.slot_indexes))) then
    raise exception 'This slot is unavailable.' using errcode = 'VB003';
  end if;

  perform public.lock_slot(_resource.id, p_slot_date, p_slot_index);

  if exists (select 1 from public.bookings b
             where b.resource_id = _resource.id and b.slot_date = p_slot_date and b.slot_index = p_slot_index
               and b.status in ('confirmed', 'checked_in') and b.owner_id = _uid) then
    raise exception 'You already have this slot.' using errcode = 'VB004';
  end if;
  if not exists (select 1 from public.bookings b
                 where b.resource_id = _resource.id and b.slot_date = p_slot_date and b.slot_index = p_slot_index
                   and b.status in ('confirmed', 'checked_in'))
     and not exists (select 1 from public.waitlist_entries w
                     where w.resource_id = _resource.id and w.slot_date = p_slot_date and w.slot_index = p_slot_index
                       and w.status = 'offered' and w.offer_expires_at > _now) then
    raise exception 'This slot is open. Book it instead.' using errcode = 'VB005';
  end if;

  -- Store the request now (decision Q10: turf needs the full roster up
  -- front); every booking rule is re-checked when the offer is accepted.
  if _facility.code = 'turf' then
    select reg_no into _owner_reg from public.profiles where id = _uid;
    if _owner_reg is null then
      raise exception 'Add your registration number on the Account page first.' using errcode = 'VB007';
    end if;
    select coalesce(array_agg(distinct upper(regexp_replace(x, '\s', '', 'g'))), '{}') into _reg_nos
    from unnest(coalesce(p_participant_reg_nos, '{}')) as t(x)
    where btrim(x) <> '';
    _count := cardinality(_reg_nos);
    if _count < _facility.min_participants or _count > _facility.max_participants then
      raise exception 'Turf bookings need % to % players.', _facility.min_participants, _facility.max_participants using errcode = 'VB005';
    end if;
    if not (_owner_reg = any (_reg_nos)) then
      raise exception 'Include your own registration number in the player list.' using errcode = 'VB005';
    end if;
  else
    _count := p_participant_count;
    if _count is null or _count < _facility.min_participants or _count > _facility.max_participants then
      raise exception '% bookings need % to % players.', _facility.name, _facility.min_participants, _facility.max_participants using errcode = 'VB005';
    end if;
  end if;

  begin
    insert into public.waitlist_entries (
      owner_id, facility_code, resource_id, slot_date, slot_index, starts_at, participant_count, participant_reg_nos
    ) values (
      _uid, _facility.code, _resource.id, p_slot_date, p_slot_index, _starts, _count,
      case when _facility.code = 'turf' then _reg_nos end
    )
    returning * into _entry;
  exception when unique_violation then
    raise exception 'You are already on the waiting list for this slot.' using errcode = 'VB004';
  end;

  return public.waitlist_json(_entry);
end;
$$;

create function public.leave_waitlist(p_entry_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  _entry public.waitlist_entries;
begin
  select * into _entry from public.waitlist_entries where id = p_entry_id and owner_id = (select auth.uid());
  if not found then
    raise exception 'Waiting-list entry not found.' using errcode = 'VB008';
  end if;
  perform public.lock_slot(_entry.resource_id, _entry.slot_date, _entry.slot_index);
  select * into _entry from public.waitlist_entries where id = p_entry_id for update;
  if _entry.status not in ('waiting', 'offered') then
    return public.waitlist_json(_entry);
  end if;

  update public.waitlist_entries set status = 'left', closed_at = public.app_now()
  where id = _entry.id returning * into _entry;

  -- A declined offer moves straight to the next student.
  perform public.offer_next(_entry.resource_id, _entry.slot_date, _entry.slot_index);
  return public.waitlist_json(_entry);
end;
$$;

-- Accepting runs the full create_booking rules. If they fail (for example
-- the student booked something else meanwhile), the offer moves on and the
-- reason is returned instead of raised, so that state change is kept.
create function public.accept_offer(p_entry_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  _entry   public.waitlist_entries;
  _booking jsonb;
  _code    text;
  _msg     text;
  _detail  text;
begin
  select * into _entry from public.waitlist_entries where id = p_entry_id and owner_id = (select auth.uid());
  if not found then
    raise exception 'Waiting-list entry not found.' using errcode = 'VB008';
  end if;
  perform public.lock_slot(_entry.resource_id, _entry.slot_date, _entry.slot_index);
  select * into _entry from public.waitlist_entries where id = p_entry_id for update;

  if _entry.status = 'accepted' then
    return jsonb_build_object('accepted', true, 'booking',
      (select public.booking_json(b) from public.bookings b where b.id = _entry.booking_id));
  end if;
  if _entry.status <> 'offered' or _entry.offer_expires_at <= public.app_now() then
    raise exception 'This offer has expired.' using errcode = 'VB011';
  end if;

  begin
    _booking := public.create_booking(
      _entry.resource_id, _entry.slot_date, _entry.slot_index,
      _entry.participant_count, _entry.participant_reg_nos, _entry.id
    );
  exception when others then
    get stacked diagnostics _code = returned_sqlstate, _msg = message_text, _detail = pg_exception_detail;
    update public.waitlist_entries set status = 'expired', closed_at = public.app_now() where id = _entry.id;
    perform public.offer_next(_entry.resource_id, _entry.slot_date, _entry.slot_index);
    return jsonb_build_object('accepted', false,
      'error', jsonb_build_object('code', _code, 'message', _msg, 'detail', _detail));
  end;

  update public.waitlist_entries
  set status = 'accepted', booking_id = (_booking ->> 'id')::uuid, closed_at = public.app_now()
  where id = _entry.id;
  return jsonb_build_object('accepted', true, 'booking', _booking);
end;
$$;

create function public.my_waitlist()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.waitlist_json(w) order by w.starts_at), '[]'::jsonb)
  from public.waitlist_entries w
  where w.owner_id = (select auth.uid())
    and (w.status in ('waiting', 'offered') or w.closed_at > public.app_now() - interval '2 days')
$$;

-- ---------------------------------------------------------------------------
-- Scheduled jobs (run every minute by pg_cron where available)
-- ---------------------------------------------------------------------------

-- No-show rule: a booking not checked in by start + 15:00 is released.
-- Rows already checked in are untouched (status filter), and the row lock
-- taken by a concurrent check-in makes this UPDATE re-check the status, so a
-- check-in that commits first always wins.
create function public.release_no_shows()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  _ids uuid[];
begin
  with released as (
    update public.bookings
    set status = 'no_show'
    where status = 'confirmed' and starts_at + interval '15 minutes' < public.app_now()
    returning id
  )
  select coalesce(array_agg(id), '{}') into _ids from released;

  update public.booking_participants set active = false where booking_id = any (_ids);
  return cardinality(_ids);
end;
$$;

-- Sessions still checked in after their slot ends are completed (decision Q9).
create function public.auto_check_out()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  _n integer;
begin
  update public.bookings
  set status = 'completed', checked_out_at = starts_at + interval '1 hour'
  where status = 'checked_in' and starts_at + interval '1 hour' <= public.app_now();
  get diagnostics _n = row_count;
  return _n;
end;
$$;

create function public.expire_offers()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  _w record;
  _n integer := 0;
begin
  for _w in
    select id, resource_id, slot_date, slot_index from public.waitlist_entries
    where status = 'offered' and offer_expires_at <= public.app_now()
    order by offer_expires_at
  loop
    perform public.lock_slot(_w.resource_id, _w.slot_date, _w.slot_index);
    update public.waitlist_entries set status = 'expired', closed_at = public.app_now()
    where id = _w.id and status = 'offered' and offer_expires_at <= public.app_now();
    if found then
      _n := _n + 1;
      perform public.offer_next(_w.resource_id, _w.slot_date, _w.slot_index);
    end if;
  end loop;

  -- Entries that can no longer receive an offer.
  update public.waitlist_entries set status = 'expired', closed_at = public.app_now()
  where status = 'waiting' and starts_at - public.app_now() < interval '2 hours';
  return _n;
end;
$$;

-- Runs every job, isolating failures, and records the outcome in job_runs.
create function public.run_scheduled_jobs()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  _run     bigint;
  _details jsonb := '{}'::jsonb;
  _ok      boolean := true;
  _job     text;
  _n       integer;
begin
  insert into public.job_runs default values returning id into _run;
  foreach _job in array array['release_no_shows', 'auto_check_out', 'expire_offers'] loop
    begin
      execute format('select public.%I()', _job) into _n;
      _details := _details || jsonb_build_object(_job, _n);
    exception when others then
      _ok := false;
      _details := _details || jsonb_build_object(_job, jsonb_build_object('error', sqlerrm));
    end;
  end loop;
  update public.job_runs set finished_at = clock_timestamp(), ok = _ok, details = _details where id = _run;
  delete from public.job_runs where started_at < now() - interval '14 days';
  return _details || jsonb_build_object('ok', _ok);
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.booking_passes    enable row level security;
alter table public.check_in_events   enable row level security;
alter table public.waitlist_entries  enable row level security;
alter table public.facility_feedback enable row level security;
alter table public.job_runs          enable row level security;

-- Passes have no policies: only the functions above read or write them.
create policy check_in_events_admin on public.check_in_events
  for select to authenticated using ((select public.has_role('sports_admin')));
create policy waitlist_select_own on public.waitlist_entries
  for select to authenticated using (owner_id = (select auth.uid()));
create policy waitlist_select_admin on public.waitlist_entries
  for select to authenticated using ((select public.has_role('sports_admin')));
-- Feedback is visible only to the sports administrator.
create policy facility_feedback_admin on public.facility_feedback
  for select to authenticated using ((select public.has_role('sports_admin')));
create policy job_runs_admin on public.job_runs
  for select to authenticated using ((select public.has_role('sports_admin')));

revoke all on public.booking_passes, public.check_in_events, public.waitlist_entries,
              public.facility_feedback, public.job_runs
  from anon, authenticated;
grant select on public.check_in_events, public.waitlist_entries, public.facility_feedback, public.job_runs to authenticated;

revoke execute on function
  public.lock_slot(uuid, date, smallint),
  public.offer_next(uuid, date, smallint),
  public.my_booking_pass(uuid),
  public.guard_check_in(text),
  public.check_out(uuid, public.feedback_rating, text),
  public.waitlist_json(public.waitlist_entries),
  public.join_waitlist(uuid, date, smallint, smallint, text[]),
  public.leave_waitlist(uuid),
  public.accept_offer(uuid),
  public.my_waitlist(),
  public.release_no_shows(),
  public.auto_check_out(),
  public.expire_offers(),
  public.run_scheduled_jobs()
  from public, anon, authenticated;

grant execute on function
  public.my_booking_pass(uuid),
  public.guard_check_in(text),
  public.check_out(uuid, public.feedback_rating, text),
  public.join_waitlist(uuid, date, smallint, smallint, text[]),
  public.leave_waitlist(uuid),
  public.accept_offer(uuid),
  public.my_waitlist()
  to authenticated;

-- ---------------------------------------------------------------------------
-- Schedule. pg_cron is available on Supabase (enable it under Database ->
-- Extensions if this block reports it missing); local test databases skip it.
-- ---------------------------------------------------------------------------
do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('vitb-every-minute', '* * * * *', 'select public.run_scheduled_jobs()');
  end if;
end
$do$;
