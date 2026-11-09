-- Tennis and pickleball bookings list every player by registration number.
--
-- Until now these courts took only a player count. The booking form now asks
-- for one registration number per player, including the booker's own. Unlike
-- the turf, the other players do not need an account on this site: each number
-- only has to be well formed and listed once. The numbers are kept on the
-- booking (and on a waiting-list entry, so an accepted offer keeps them).
--
-- The check lives in the create_booking and join_waitlist wrappers, so the
-- original functions are unchanged. A call with a count and no numbers still
-- works, which keeps older waiting-list entries acceptable.

alter table public.bookings add column participant_reg_nos text[];

-- Returns the cleaned list for a court booking, or null when the rules do not
-- apply (turf, which has its own roster checks, or no numbers given).
create function public.check_player_reg_nos(p_resource_id uuid, p_reg_nos text[])
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
  if not found or _facility.code = 'turf' or p_reg_nos is null
     or not exists (select 1 from unnest(p_reg_nos) as t(x) where btrim(x) <> '') then
    return null;
  end if;

  select reg_no into _owner_reg from public.profiles where id = (select auth.uid());
  if _owner_reg is null then
    raise exception 'Add your registration number on the Account page before booking.' using errcode = 'VB007';
  end if;

  select coalesce(array_agg(n order by ord), '{}') into _reg_nos
  from (
    select upper(regexp_replace(x, '\s', '', 'g')) as n, min(ord) as ord
    from unnest(p_reg_nos) with ordinality as t(x, ord)
    where btrim(x) <> ''
    group by 1
  ) s;

  select coalesce(array_agg(n), '{}') into _dupes
  from (
    select upper(regexp_replace(x, '\s', '', 'g')) as n
    from unnest(p_reg_nos) as t(x)
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

revoke execute on function public.check_player_reg_nos(uuid, text[]) from public, anon, authenticated;

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
declare
  _reg_nos text[];
  _result  jsonb;
begin
  perform public.require_not_guard();
  _reg_nos := public.check_player_reg_nos(p_resource_id, p_participant_reg_nos);
  _result := public.create_booking_unguarded(
    p_resource_id, p_slot_date, p_slot_index,
    coalesce(cardinality(_reg_nos)::smallint, p_participant_count), p_participant_reg_nos, p_idempotency_key);
  if _reg_nos is not null then
    update public.bookings set participant_reg_nos = _reg_nos
    where id = (_result ->> 'id')::uuid and participant_reg_nos is null;
  end if;
  return _result;
end;
$$;

create or replace function public.join_waitlist(
  p_resource_id         uuid,
  p_slot_date           date,
  p_slot_index          smallint,
  p_participant_count   smallint,
  p_participant_reg_nos text[]
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  _reg_nos text[];
  _result  jsonb;
begin
  perform public.require_not_guard();
  _reg_nos := public.check_player_reg_nos(p_resource_id, p_participant_reg_nos);
  _result := public.join_waitlist_unguarded(
    p_resource_id, p_slot_date, p_slot_index,
    coalesce(cardinality(_reg_nos)::smallint, p_participant_count), p_participant_reg_nos);
  if _reg_nos is not null then
    update public.waitlist_entries set participant_reg_nos = _reg_nos where id = (_result ->> 'id')::uuid;
  end if;
  return _result;
end;
$$;
