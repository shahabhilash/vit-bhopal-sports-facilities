-- Only the student making a booking needs an account.
--
-- The booker must be signed in with a verified college email and have their
-- registration number saved. The other players are listed by registration
-- number only: each must be well formed, listed once, and the count must fit
-- the facility, but they do not need to have signed in. This now applies to
-- the turf as well as the courts. The list is kept on the booking.
--
-- Replaces 20261110090000, which required an account for every player.

create or replace function public.check_player_reg_nos(p_resource_id uuid, p_reg_nos text[])
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _facility  public.facilities;
  _owner_reg text;
  _reg_nos   text[];
  _dupes     text[];
  _bad       text[];
  _count     integer;
begin
  select f.* into _facility
  from public.facility_resources r
  join public.facilities f on f.code = r.facility_code
  where r.id = p_resource_id;
  if not found then
    return null;
  end if;
  -- Courts still accept a plain count (older waiting-list entries); the turf always needs its list.
  if _facility.code <> 'turf'
     and (p_reg_nos is null or not exists (select 1 from unnest(p_reg_nos) as t(x) where btrim(x) <> '')) then
    return null;
  end if;

  select reg_no into _owner_reg from public.profiles where id = (select auth.uid());
  if _owner_reg is null then
    raise exception 'Add your registration number on the Account page before booking.' using errcode = 'VB007';
  end if;

  select coalesce(array_agg(n order by ord), '{}') into _reg_nos
  from (
    select upper(regexp_replace(x, '\s', '', 'g')) as n, min(ord) as ord
    from unnest(coalesce(p_reg_nos, '{}')) with ordinality as t(x, ord)
    where btrim(x) <> ''
    group by 1
  ) s;

  select coalesce(array_agg(n), '{}') into _dupes
  from (
    select upper(regexp_replace(x, '\s', '', 'g')) as n
    from unnest(coalesce(p_reg_nos, '{}')) as t(x)
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
    raise exception '% bookings need % to % players; you listed %.',
      _facility.name, _facility.min_participants, _facility.max_participants, _count using errcode = 'VB005';
  end if;
  if not (_owner_reg = any (_reg_nos)) then
    raise exception 'Include your own registration number in the player list.' using errcode = 'VB005';
  end if;

  return _reg_nos;
end;
$$;

-- The original booking rules, with the player checks replaced by
-- check_player_reg_nos at the same point. Only the booker is attached to the
-- booking; the list is stored on it.
create or replace function public.create_booking_unguarded(
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
  _reg_nos    text[];
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

  -- Participants: a registration number per player (only the booker needs an
  -- account), or a plain count for older court waiting-list entries.
  _reg_nos := public.check_player_reg_nos(_resource.id, p_participant_reg_nos);
  _count := coalesce(cardinality(_reg_nos)::smallint, p_participant_count);
  if _count is null or _count < _facility.min_participants or _count > _facility.max_participants then
    raise exception '% bookings need % to % players.', _facility.name, _facility.min_participants, _facility.max_participants
      using errcode = 'VB005';
  end if;
  _people := array[_uid];

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
      participant_count, participant_reg_nos, idempotency_key
    ) values (
      _uid, _facility.code, _resource.id, p_slot_date, p_slot_index, _starts_at,
      public.turf_week_start(p_slot_date), _count, _reg_nos, p_idempotency_key
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

-- Back to the plain guard check from 20261104090000: the booking function
-- above now checks and stores the player list itself.
create or replace function public.create_booking(
  p_resource_id         uuid,
  p_slot_date           date,
  p_slot_index          smallint,
  p_participant_count   smallint,
  p_participant_reg_nos text[],
  p_idempotency_key     uuid
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform public.require_not_guard();
  return public.create_booking_unguarded(
    p_resource_id, p_slot_date, p_slot_index, p_participant_count, p_participant_reg_nos, p_idempotency_key);
end;
$$;
