-- Guards see every listed player's registration number when they scan a pass.
--
-- Same as guard_check_in in 20261027090000, plus `playerRegNos`: the list
-- saved with the booking (empty for bookings made before player lists were
-- kept), so the guard can check the group at the gate.

-- Guard scan. Returns an outcome object rather than raising, so every scan
-- (including invalid ones) is logged.
create or replace function public.guard_check_in(p_code text)
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
      'ownerRegNo', _owner.reg_no,
      'playerRegNos', coalesce(to_jsonb(_booking.participant_reg_nos), '[]'::jsonb)
    ),
    'checkedInAt', public.iso_utc(_booking.checked_in_at),
    'opensAt', public.iso_utc(_booking.starts_at - interval '10 minutes'),
    'closesAt', public.iso_utc(_booking.starts_at + interval '15 minutes')
  );
end;
$$;
