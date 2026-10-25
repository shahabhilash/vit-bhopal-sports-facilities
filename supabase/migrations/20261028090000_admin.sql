-- =============================================================================
-- Phase 6: sports-administrator tools.
--
--   * Analytics: bookings vs actual attendance, no-shows, cancellations,
--     daily trend, busiest slots, weekday x slot heatmap. Attendance means a
--     guard check-in; bookings alone are not a measure of crowd.
--   * Facility blocks (HPL, maintenance, events): preview, create, edit,
--     remove. Bookings inside a new block are cancelled only when the admin
--     explicitly confirms (decision Q15); the student sees the reason.
--   * Bookings for a day, with single cancellation.
--   * Feedback inbox with status tracking, and private issue photos.
--   * Staff list (guards and admins).
--
-- Every admin_* function checks the sports_admin role itself; RLS remains as
-- before. New error code: VB012 BLOCK_CONFLICT.
-- =============================================================================

alter table public.bookings
  add column cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 200);

-- Feedback timestamps follow the application clock like every other rule
-- (the 24-hour photo window is measured against it).
alter table public.facility_feedback
  alter column created_at set default public.app_now(),
  alter column updated_at set default public.app_now();

-- Analytics and the admin day view scan by date across every status.
create index bookings_slot_date_idx on public.bookings (slot_date, slot_index);

-- Clients see why a booking was cancelled by the sports office.
create or replace function public.booking_json(b public.bookings)
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
    'checkedOutAt', public.iso_utc(b.checked_out_at),
    'cancelReason', b.cancel_reason
  )
  from public.facility_resources r
  where r.id = b.resource_id
$$;

create function public.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _uid uuid := (select auth.uid());
begin
  if _uid is null or not public.has_role('sports_admin') then
    raise exception 'Only the sports administrator can do this.' using errcode = '42501';
  end if;
  return _uid;
end;
$$;

-- Cancels one booking on behalf of the sports office. Caller holds lock_slot.
create function public.office_cancel(p_booking public.bookings, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.bookings
  set status = 'cancelled', cancelled_at = public.app_now(), cancel_reason = left(p_reason, 200)
  where id = p_booking.id and status = 'confirmed';
  update public.booking_participants set active = false where booking_id = p_booking.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Analytics
-- ---------------------------------------------------------------------------
create function public.admin_analytics(p_from date, p_to date)
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

  return jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'byFacility', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'facility', x.code,
        'bookings', x.bookings,
        'attended', x.attended,
        'noShows', x.no_shows,
        'cancellations', x.cancellations,
        'playersAttended', x.players_attended,
        'slotCapacity', x.resources * 12 * _days
      ) order by x.sort_order), '[]'::jsonb)
      from (
        select f.code, f.sort_order,
          count(b.id) filter (where b.status <> 'cancelled') as bookings,
          count(b.id) filter (where b.checked_in_at is not null) as attended,
          count(b.id) filter (where b.status = 'no_show') as no_shows,
          count(b.id) filter (where b.status = 'cancelled') as cancellations,
          coalesce(sum(b.participant_count) filter (where b.checked_in_at is not null), 0) as players_attended,
          (select count(*) from public.facility_resources r where r.facility_code = f.code and r.is_active) as resources
        from public.facilities f
        left join public.bookings b on b.facility_code = f.code and b.slot_date between p_from and p_to
        where f.bookable
        group by f.code, f.sort_order
      ) x
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', d::date,
        'bookings', (select count(*) from public.bookings b where b.slot_date = d::date and b.status <> 'cancelled'),
        'attended', (select count(*) from public.bookings b where b.slot_date = d::date and b.checked_in_at is not null)
      ) order by d), '[]'::jsonb)
      from generate_series(p_from, p_to, interval '1 day') as d
    ),
    'bySlot', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'slotIndex', s.slot_index,
        'bookings', (select count(*) from public.bookings b
                     where b.slot_index = s.slot_index and b.slot_date between p_from and p_to and b.status <> 'cancelled'),
        'attended', (select count(*) from public.bookings b
                     where b.slot_index = s.slot_index and b.slot_date between p_from and p_to and b.checked_in_at is not null)
      ) order by s.slot_index), '[]'::jsonb)
      from public.time_slots s
    ),
    'heatmap', (
      select coalesce(jsonb_agg(jsonb_build_object('weekday', h.dow, 'slotIndex', h.slot_index, 'attended', h.n)), '[]'::jsonb)
      from (
        select extract(dow from b.slot_date)::int as dow, b.slot_index, count(*) as n
        from public.bookings b
        where b.slot_date between p_from and p_to and b.checked_in_at is not null
        group by 1, 2
      ) h
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Facility blocks
-- ---------------------------------------------------------------------------
create function public.block_json(b public.facility_blocks)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id,
    'facility', b.facility_code,
    'resourceId', b.resource_id,
    'resource', (select name from public.facility_resources where id = b.resource_id),
    'startDate', b.start_date,
    'endDate', b.end_date,
    'slotIndexes', to_jsonb(b.slot_indexes),
    'reason', b.reason,
    'label', public.block_label(b.reason),
    'note', (select note from public.facility_block_notes where block_id = b.id),
    'createdAt', public.iso_utc(b.created_at)
  )
$$;

-- Active bookings and other blocks that a proposed block would cover.
create function public.admin_block_overlaps(
  p_facility    text,
  p_resource_id uuid,
  p_start       date,
  p_end         date,
  p_slots       smallint[],
  p_exclude     uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'bookings', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id,
        'resource', r.name,
        'date', b.slot_date,
        'slotIndex', b.slot_index,
        'status', b.status,
        'participants', b.participant_count,
        'ownerName', p.full_name,
        'ownerRegNo', p.reg_no
      ) order by b.slot_date, b.slot_index, r.sort_order), '[]'::jsonb)
      from public.bookings b
      join public.facility_resources r on r.id = b.resource_id
      join public.profiles p on p.id = b.owner_id
      where b.facility_code = p_facility
        and (p_resource_id is null or b.resource_id = p_resource_id)
        and b.slot_date between p_start and p_end
        and (p_slots is null or b.slot_index = any (p_slots))
        and b.status in ('confirmed', 'checked_in')
    ),
    'blocks', (
      select coalesce(jsonb_agg(public.block_json(fb) order by fb.start_date), '[]'::jsonb)
      from public.facility_blocks fb
      where fb.facility_code = p_facility
        and (p_exclude is null or fb.id <> p_exclude)
        and (p_resource_id is null or fb.resource_id is null or fb.resource_id = p_resource_id)
        and fb.start_date <= p_end and fb.end_date >= p_start
        and (p_slots is null or fb.slot_indexes is null or fb.slot_indexes && p_slots)
    )
  );
end;
$$;

-- Creates a block, or replaces one when p_block_id is given. If confirmed
-- bookings fall inside it, the call fails with VB012 unless
-- p_cancel_affected is true, in which case they are cancelled with the
-- block's public reason. Sessions already checked in are left alone.
create function public.admin_save_block(
  p_block_id        uuid,
  p_facility        text,
  p_resource_id     uuid,
  p_start           date,
  p_end             date,
  p_slots           smallint[],
  p_reason          public.block_reason,
  p_note            text,
  p_cancel_affected boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  _uid      uuid := public.require_admin();
  _slots    smallint[];
  _block    public.facility_blocks;
  _b        public.bookings;
  _affected integer;
  _note     text := nullif(btrim(coalesce(p_note, '')), '');
  _n        integer := 0;
begin
  if not exists (select 1 from public.facilities where code = p_facility and bookable) then
    raise exception 'Choose a bookable facility.' using errcode = 'VB005';
  end if;
  if p_resource_id is not null and not exists (
    select 1 from public.facility_resources where id = p_resource_id and facility_code = p_facility) then
    raise exception 'That court does not belong to this facility.' using errcode = 'VB005';
  end if;
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'The end date must be on or after the start date.' using errcode = 'VB005';
  end if;
  if p_end < public.ist_today() then
    raise exception 'The block must end today or later.' using errcode = 'VB005';
  end if;
  if p_end - p_start > 365 then
    raise exception 'Blocks can span at most a year.' using errcode = 'VB005';
  end if;
  if p_reason is null then
    raise exception 'Choose a reason.' using errcode = 'VB005';
  end if;
  if _note is not null and char_length(_note) > 1000 then
    raise exception 'Keep the note under 1000 characters.' using errcode = 'VB005';
  end if;
  select case when p_slots is null or cardinality(p_slots) = 0 then null
              else array(select distinct s from unnest(p_slots) s order by s) end
  into _slots;
  if _slots is not null and not (_slots <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]) then
    raise exception 'Choose slots between 1 and 12.' using errcode = 'VB005';
  end if;

  if p_block_id is not null then
    delete from public.facility_blocks where id = p_block_id;
    if not found then
      raise exception 'Block not found.' using errcode = 'VB008';
    end if;
  end if;

  select count(*) into _affected
  from public.bookings b
  where b.facility_code = p_facility
    and (p_resource_id is null or b.resource_id = p_resource_id)
    and b.slot_date between p_start and p_end
    and (_slots is null or b.slot_index = any (_slots))
    and b.status = 'confirmed';

  if _affected > 0 and not coalesce(p_cancel_affected, false) then
    raise exception '% booking(s) fall inside this block. Confirm to cancel them.', _affected
      using errcode = 'VB012', detail = jsonb_build_object('affected', _affected)::text;
  end if;

  insert into public.facility_blocks (facility_code, resource_id, start_date, end_date, slot_indexes, reason, created_by)
  values (p_facility, p_resource_id, p_start, p_end, _slots, p_reason, _uid)
  returning * into _block;
  if _note is not null then
    insert into public.facility_block_notes (block_id, note) values (_block.id, _note);
  end if;

  for _b in
    select * from public.bookings b
    where b.facility_code = p_facility
      and (p_resource_id is null or b.resource_id = p_resource_id)
      and b.slot_date between p_start and p_end
      and (_slots is null or b.slot_index = any (_slots))
      and b.status = 'confirmed'
    order by b.slot_date, b.slot_index
  loop
    perform public.lock_slot(_b.resource_id, _b.slot_date, _b.slot_index);
    perform public.office_cancel(_b, 'Cancelled by the sports office: ' || public.block_label(p_reason));
    _n := _n + 1;
  end loop;

  -- Waiting lists inside the block can never be served.
  update public.waitlist_entries w
  set status = 'expired', closed_at = public.app_now()
  where w.facility_code = p_facility
    and (p_resource_id is null or w.resource_id = p_resource_id)
    and w.slot_date between p_start and p_end
    and (_slots is null or w.slot_index = any (_slots))
    and w.status in ('waiting', 'offered');

  return jsonb_build_object('block', public.block_json(_block), 'cancelled', _n);
end;
$$;

create function public.admin_delete_block(p_block_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  delete from public.facility_blocks where id = p_block_id;
  if not found then
    raise exception 'Block not found.' using errcode = 'VB008';
  end if;
end;
$$;

create function public.admin_blocks(p_from date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return (
    select coalesce(jsonb_agg(public.block_json(fb) order by fb.start_date, fb.facility_code), '[]'::jsonb)
    from public.facility_blocks fb
    where fb.end_date >= coalesce(p_from, public.ist_today())
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create function public.admin_bookings(p_date date, p_facility text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return (
    select coalesce(jsonb_agg(public.booking_json(b) || jsonb_build_object(
      'ownerName', p.full_name, 'ownerRegNo', p.reg_no, 'ownerEmail', p.email
    ) order by b.slot_index, r.sort_order), '[]'::jsonb)
    from public.bookings b
    join public.facility_resources r on r.id = b.resource_id
    join public.profiles p on p.id = b.owner_id
    where b.slot_date = p_date
      and (p_facility is null or b.facility_code = p_facility)
  );
end;
$$;

create function public.admin_cancel_booking(p_booking_id uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  _b      public.bookings;
  _reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform public.require_admin();
  if _reason is null or char_length(_reason) > 150 then
    raise exception 'Give a short reason (up to 150 characters); the student will see it.' using errcode = 'VB005';
  end if;
  select * into _b from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Booking not found.' using errcode = 'VB008';
  end if;
  perform public.lock_slot(_b.resource_id, _b.slot_date, _b.slot_index);
  select * into _b from public.bookings where id = p_booking_id for update;
  if _b.status <> 'confirmed' then
    raise exception 'Only upcoming bookings can be cancelled.' using errcode = 'VB009';
  end if;
  perform public.office_cancel(_b, 'Cancelled by the sports office: ' || _reason);
  if _b.starts_at - public.app_now() >= interval '2 hours' then
    perform public.offer_next(_b.resource_id, _b.slot_date, _b.slot_index);
  end if;
  select * into _b from public.bookings where id = p_booking_id;
  return public.booking_json(_b);
end;
$$;

-- ---------------------------------------------------------------------------
-- Feedback
-- ---------------------------------------------------------------------------
create function public.admin_feedback(
  p_status   public.feedback_status,
  p_facility text,
  p_rating   public.feedback_rating,
  p_from     date,
  p_to       date,
  p_limit    integer,
  p_offset   integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _limit  integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  _offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.require_admin();
  return (
    with filtered as (
      select f.* from public.facility_feedback f
      where (p_status is null or f.status = p_status)
        and (p_facility is null or f.facility_code = p_facility)
        and (p_rating is null or f.rating = p_rating)
        and (p_from is null or f.slot_date >= p_from)
        and (p_to is null or f.slot_date <= p_to)
    )
    select jsonb_build_object(
      'total', (select count(*) from filtered),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', f.id,
          'facility', f.facility_code,
          'resource', f.resource_name,
          'date', f.slot_date,
          'slotIndex', f.slot_index,
          'rating', f.rating,
          'description', f.description,
          'status', f.status,
          'hasPhoto', f.photo_path is not null,
          'createdAt', public.iso_utc(f.created_at),
          'updatedAt', public.iso_utc(f.updated_at),
          'authorName', p.full_name,
          'authorRegNo', p.reg_no
        ) order by f.created_at desc)
        from (select * from filtered order by created_at desc limit _limit offset _offset) f
        left join public.profiles p on p.id = f.author_id
      ), '[]'::jsonb)
    )
  );
end;
$$;

create function public.admin_set_feedback_status(p_feedback_id uuid, p_status public.feedback_status)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  if p_status is null then
    raise exception 'Choose a status.' using errcode = 'VB005';
  end if;
  update public.facility_feedback set status = p_status, updated_at = public.app_now() where id = p_feedback_id;
  if not found then
    raise exception 'Feedback not found.' using errcode = 'VB008';
  end if;
end;
$$;

create function public.admin_feedback_photo_path(p_feedback_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _path text;
begin
  perform public.require_admin();
  select photo_path into _path from public.facility_feedback where id = p_feedback_id;
  if _path is null then
    raise exception 'No photo for this report.' using errcode = 'VB008';
  end if;
  return _path;
end;
$$;

-- The student's own issue report for a booking, if it can still take a
-- photo (one photo, within 24 hours of checkout).
create function public.feedback_photo_target(p_booking_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _f public.facility_feedback;
begin
  select * into _f from public.facility_feedback
  where booking_id = p_booking_id and author_id = (select auth.uid());
  if not found or _f.rating <> 'issue' then
    raise exception 'No issue report found for this booking.' using errcode = 'VB008';
  end if;
  if _f.photo_path is not null then
    raise exception 'A photo is already attached to this report.' using errcode = 'VB009';
  end if;
  if _f.created_at < public.app_now() - interval '24 hours' then
    raise exception 'Photos can be added within 24 hours of checking out.' using errcode = 'VB009';
  end if;
  return _f.id;
end;
$$;

create function public.set_feedback_photo(p_feedback_id uuid, p_path text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_path is null or p_path !~ ('^feedback/' || p_feedback_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then
    raise exception 'Invalid photo path.' using errcode = 'VB005';
  end if;
  update public.facility_feedback
  set photo_path = p_path, updated_at = public.app_now()
  where id = p_feedback_id and author_id = (select auth.uid()) and rating = 'issue' and photo_path is null;
  if not found then
    raise exception 'A photo is already attached to this report.' using errcode = 'VB009';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------
create function public.admin_staff()
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
      'id', p.id, 'email', p.email, 'fullName', p.full_name,
      'roles', (select jsonb_agg(ur.role order by ur.role) from public.user_roles ur
                where ur.user_id = p.id and ur.role <> 'student')
    ) order by p.email), '[]'::jsonb)
    from public.profiles p
    where exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role <> 'student')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Private storage bucket for issue photos (Supabase only). No storage
-- policies are created, so only the API's service role can read or write;
-- staff view photos through short-lived signed URLs.
-- ---------------------------------------------------------------------------
do $do$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('feedback-photos', 'feedback-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update
      set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end
$do$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function
  public.require_admin(),
  public.office_cancel(public.bookings, text),
  public.admin_analytics(date, date),
  public.block_json(public.facility_blocks),
  public.admin_block_overlaps(text, uuid, date, date, smallint[], uuid),
  public.admin_save_block(uuid, text, uuid, date, date, smallint[], public.block_reason, text, boolean),
  public.admin_delete_block(uuid),
  public.admin_blocks(date),
  public.admin_bookings(date, text),
  public.admin_cancel_booking(uuid, text),
  public.admin_feedback(public.feedback_status, text, public.feedback_rating, date, date, integer, integer),
  public.admin_set_feedback_status(uuid, public.feedback_status),
  public.admin_feedback_photo_path(uuid),
  public.feedback_photo_target(uuid),
  public.set_feedback_photo(uuid, text),
  public.admin_staff()
  from public, anon, authenticated;

-- Each of these checks the caller's role or ownership itself.
grant execute on function
  public.admin_analytics(date, date),
  public.admin_block_overlaps(text, uuid, date, date, smallint[], uuid),
  public.admin_save_block(uuid, text, uuid, date, date, smallint[], public.block_reason, text, boolean),
  public.admin_delete_block(uuid),
  public.admin_blocks(date),
  public.admin_bookings(date, text),
  public.admin_cancel_booking(uuid, text),
  public.admin_feedback(public.feedback_status, text, public.feedback_rating, date, date, integer, integer),
  public.admin_set_feedback_status(uuid, public.feedback_status),
  public.admin_feedback_photo_path(uuid),
  public.feedback_photo_target(uuid),
  public.set_feedback_photo(uuid, text),
  public.admin_staff()
  to authenticated;
