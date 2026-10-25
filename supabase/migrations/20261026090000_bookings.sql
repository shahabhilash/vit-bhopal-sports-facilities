-- =============================================================================
-- Booking engine: bookings, participants, facility blocks, and the functions
-- that are the only way to create or cancel a booking.
--
-- Concurrency model
--   Correctness never depends on reading availability first. Partial unique
--   indexes make the conflicting states unrepresentable, so when two requests
--   race for the same slot, Postgres lets exactly one INSERT commit and the
--   other gets a unique violation, which is reported as SLOT_TAKEN.
--
--   bookings_active_slot_uq     one active booking per resource and slot
--   bookings_owner_day_uq       one booking per owner, sport and day (Q3)
--   bookings_owner_turf_week_uq one turf booking per owner per turf week (Q3)
--   participants_active_slot_uq a person is in at most one active booking
--                               per date and slot (Q3)
--   bookings_owner_key_uq       idempotent retries (same Idempotency-Key)
--
-- Error codes (SQLSTATE, mapped to API error codes by apps/api):
--   VB001 SLOT_TAKEN             VB006 EMAIL_NOT_VERIFIED
--   VB002 BOOKING_WINDOW_CLOSED  VB007 PROFILE_INCOMPLETE
--   VB003 FACILITY_BLOCKED       VB008 NOT_FOUND
--   VB004 LIMIT_REACHED          VB009 CANCELLATION_CLOSED
--   VB005 VALIDATION_FAILED      VB010 PARTICIPANT_CONFLICT
-- =============================================================================

create type public.booking_status as enum ('confirmed', 'checked_in', 'completed', 'cancelled', 'no_show');
create type public.block_reason as enum ('hpl', 'maintenance', 'event', 'other');

-- ---------------------------------------------------------------------------
-- Time. Every rule reads the clock through app_now() so tests can pin it.
-- ---------------------------------------------------------------------------
create function public.app_now()
returns timestamptz
language sql
stable
set search_path = ''
as $$ select now() $$;

create function public.ist_today()
returns date
language sql
stable
set search_path = ''
as $$ select (public.app_now() at time zone 'Asia/Kolkata')::date $$;

-- Turf weeks run Saturday -> Friday and open at 12:00 IST on the Friday
-- before (decision Q2). Mirrors turfReleaseInstant() in packages/shared.
create function public.turf_week_start(d date)
returns date
language sql
immutable
set search_path = ''
as $$ select d - ((extract(dow from d)::int + 1) % 7) $$;

create function public.turf_release_at(d date)
returns timestamptz
language sql
immutable
set search_path = ''
as $$ select ((public.turf_week_start(d) - 1) + time '12:00') at time zone 'Asia/Kolkata' $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.bookings (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.profiles (id) on delete cascade,
  facility_code     text not null references public.facilities (code),
  resource_id       uuid not null references public.facility_resources (id),
  slot_date         date not null,
  slot_index        smallint not null references public.time_slots (slot_index),
  starts_at         timestamptz not null,
  week_start        date not null,
  participant_count smallint not null check (participant_count between 1 and 26),
  status            public.booking_status not null default 'confirmed',
  idempotency_key   uuid not null,
  created_at        timestamptz not null default now(),
  cancelled_at      timestamptz,
  checked_in_at     timestamptz,
  checked_out_at    timestamptz,
  check (week_start = public.turf_week_start(slot_date))
);

create unique index bookings_owner_key_uq on public.bookings (owner_id, idempotency_key);
create unique index bookings_active_slot_uq on public.bookings (resource_id, slot_date, slot_index)
  where status in ('confirmed', 'checked_in');
create unique index bookings_owner_day_uq on public.bookings (owner_id, facility_code, slot_date)
  where status <> 'cancelled';
create unique index bookings_owner_turf_week_uq on public.bookings (owner_id, week_start)
  where facility_code = 'turf' and status <> 'cancelled';
create index bookings_availability_idx on public.bookings (facility_code, slot_date)
  where status in ('confirmed', 'checked_in');
create index bookings_owner_idx on public.bookings (owner_id, slot_date desc);
create index bookings_starts_at_idx on public.bookings (starts_at) where status = 'confirmed';

create table public.booking_participants (
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  slot_date   date not null,
  slot_index  smallint not null,
  is_owner    boolean not null default false,
  active      boolean not null default true,
  primary key (booking_id, profile_id)
);

create unique index participants_active_slot_uq on public.booking_participants (profile_id, slot_date, slot_index)
  where active;
create index participants_profile_idx on public.booking_participants (profile_id);

create table public.facility_blocks (
  id             uuid primary key default gen_random_uuid(),
  facility_code  text not null references public.facilities (code),
  -- null blocks every resource of the facility
  resource_id    uuid references public.facility_resources (id),
  start_date     date not null,
  end_date       date not null,
  -- null blocks the whole day
  slot_indexes   smallint[] check (slot_indexes is null or (cardinality(slot_indexes) > 0 and slot_indexes <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[])),
  reason         public.block_reason not null,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  check (end_date >= start_date)
);

create index facility_blocks_range_idx on public.facility_blocks (facility_code, start_date, end_date);

-- Internal notes are kept apart so the public block list can never expose them.
create table public.facility_block_notes (
  block_id  uuid primary key references public.facility_blocks (id) on delete cascade,
  note      text not null check (char_length(note) <= 1000)
);

create function public.block_label(r public.block_reason)
returns text
language sql
immutable
set search_path = ''
as $$
  select case r
    when 'hpl' then 'Booked for HPL'
    when 'maintenance' then 'Under maintenance'
    when 'event' then 'Reserved for an event'
    else 'Unavailable'
  end
$$;

-- Timestamps leave the database as UTC ISO-8601 strings, whatever the session time zone.
create function public.iso_utc(t timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$ select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$;

-- ---------------------------------------------------------------------------
-- JSON shape returned to clients (camelCase, matches BookingDto in shared).
-- ---------------------------------------------------------------------------
create function public.booking_json(b public.bookings)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id,
    'facility', b.facility_code,
    'resourceId', b.resource_id,
    'resource', r.name,
    'date', b.slot_date,
    'slotIndex', b.slot_index,
    'startsAt', public.iso_utc(b.starts_at),
    'participants', b.participant_count,
    'status', b.status,
    'isOwner', b.owner_id = (select auth.uid()),
    'createdAt', public.iso_utc(b.created_at),
    'checkedInAt', public.iso_utc(b.checked_in_at),
    'checkedOutAt', public.iso_utc(b.checked_out_at)
  )
  from public.facility_resources r
  where r.id = b.resource_id
$$;

-- ---------------------------------------------------------------------------
-- create_booking: the only way to create a booking.
-- ---------------------------------------------------------------------------
create function public.create_booking(
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

-- ---------------------------------------------------------------------------
-- cancel_booking: owner only, until 1 hour before the start (decision Q11).
-- ---------------------------------------------------------------------------
create function public.cancel_booking(p_booking_id uuid)
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

  return public.booking_json(_booking);
end;
$$;

-- Used by RLS: true when the caller is listed on the booking. SECURITY
-- DEFINER avoids a policy cycle between bookings and booking_participants.
create function public.is_booking_participant(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.booking_participants
    where booking_id = p_booking_id and profile_id = (select auth.uid())
  )
$$;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

-- Taken and blocked slots for a facility. Exposes no owner or participant data.
create function public.get_availability(p_facility text, p_from date, p_to date)
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
    ) entries
  ), '[]'::jsonb);
end;
$$;

-- The caller's bookings (as owner or listed player). Runs as the caller, so RLS applies.
create function public.my_bookings()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.booking_json(b) order by b.slot_date desc, b.slot_index desc), '[]'::jsonb)
  from (
    select * from public.bookings
    where owner_id = (select auth.uid()) or public.is_booking_participant(id)
    order by slot_date desc, slot_index desc
    limit 200
  ) b
$$;

create function public.list_resources()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'facility', r.facility_code, 'name', r.name
  ) order by r.facility_code, r.sort_order), '[]'::jsonb)
  from public.facility_resources r
  where r.is_active
$$;

-- Profile edits go through RLS (own row) and the reg_no trigger.
create function public.update_my_profile(p_full_name text, p_reg_no text)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  _p public.profiles;
begin
  update public.profiles
  set full_name = coalesce(nullif(btrim(p_full_name), ''), full_name),
      reg_no = coalesce(nullif(upper(regexp_replace(coalesce(p_reg_no, ''), '\s', '', 'g')), ''), reg_no)
  where id = (select auth.uid())
  returning * into _p;
  if not found then
    raise exception 'Profile not found.' using errcode = 'VB008';
  end if;
  return jsonb_build_object('id', _p.id, 'email', _p.email, 'fullName', _p.full_name, 'regNo', _p.reg_no);
end;
$$;

create function public.my_profile()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id, 'email', p.email, 'fullName', p.full_name, 'regNo', p.reg_no,
    'roles', coalesce((select jsonb_agg(ur.role order by ur.role) from public.user_roles ur where ur.user_id = p.id), '[]'::jsonb)
  )
  from public.profiles p
  where p.id = (select auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.bookings             enable row level security;
alter table public.booking_participants enable row level security;
alter table public.facility_blocks      enable row level security;
alter table public.facility_block_notes enable row level security;

create policy bookings_select_own on public.bookings
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_booking_participant(id));

create policy bookings_select_admin on public.bookings
  for select to authenticated
  using ((select public.has_role('sports_admin')));

-- Players see their own row; owners see their booking's roster.
create policy participants_select on public.booking_participants
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or exists (select 1 from public.bookings b where b.id = booking_id and b.owner_id = (select auth.uid()))
    or (select public.has_role('sports_admin'))
  );

create policy facility_blocks_read on public.facility_blocks
  for select to anon, authenticated
  using (true);

create policy facility_block_notes_admin on public.facility_block_notes
  for select to authenticated
  using ((select public.has_role('sports_admin')));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on public.bookings, public.booking_participants, public.facility_blocks, public.facility_block_notes
  from anon, authenticated;

grant select on public.bookings, public.booking_participants, public.facility_block_notes to authenticated;
grant select on public.facility_blocks to anon, authenticated;

revoke execute on function
  public.app_now(),
  public.ist_today(),
  public.turf_week_start(date),
  public.turf_release_at(date),
  public.block_label(public.block_reason),
  public.booking_json(public.bookings),
  public.iso_utc(timestamptz),
  public.create_booking(uuid, date, smallint, smallint, text[], uuid),
  public.cancel_booking(uuid),
  public.get_availability(text, date, date),
  public.my_bookings(),
  public.list_resources(),
  public.update_my_profile(text, text),
  public.my_profile(),
  public.is_booking_participant(uuid)
  from public, anon, authenticated;

grant execute on function public.create_booking(uuid, date, smallint, smallint, text[], uuid) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.get_availability(text, date, date) to anon, authenticated;
grant execute on function public.list_resources() to anon, authenticated;
grant execute on function public.my_bookings() to authenticated;
grant execute on function public.update_my_profile(text, text) to authenticated;
grant execute on function public.my_profile() to authenticated;
grant execute on function public.is_booking_participant(uuid) to authenticated;
-- Invoker functions above call these helpers as the caller.
grant execute on function public.booking_json(public.bookings), public.iso_utc(timestamptz) to authenticated;
grant execute on function public.app_now(), public.ist_today() to authenticated;
