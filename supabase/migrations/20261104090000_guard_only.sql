-- Phase 7 follow-up: guard accounts can only check bookings in.
--
-- Every account also holds the default `student` role, so until now a guard
-- could book, join waitlists and edit a profile like any student. From here
-- on, a caller with the `guard` role (and not `sports_admin`) is refused by
-- every student action. Each original function is renamed to *_unguarded
-- with no client grants, and a wrapper with the same name, arguments and
-- security mode checks the caller first, so the API and callers inside the
-- database (accept_offer -> create_booking) are unchanged.
--
-- guard_check_in, my_profile, get_availability and list_resources stay open:
-- the scanner needs the first two, and the last two are public reads.

create function public.require_not_guard()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.has_role('guard') and not public.has_role('sports_admin') then
    raise exception 'Guard accounts can only check bookings in.' using errcode = '42501';
  end if;
end;
$$;

alter function public.create_booking(uuid, date, smallint, smallint, text[], uuid) rename to create_booking_unguarded;
alter function public.cancel_booking(uuid) rename to cancel_booking_unguarded;
alter function public.my_booking_pass(uuid) rename to my_booking_pass_unguarded;
alter function public.check_out(uuid, public.feedback_rating, text) rename to check_out_unguarded;
alter function public.join_waitlist(uuid, date, smallint, smallint, text[]) rename to join_waitlist_unguarded;
alter function public.leave_waitlist(uuid) rename to leave_waitlist_unguarded;
alter function public.accept_offer(uuid) rename to accept_offer_unguarded;
alter function public.my_waitlist() rename to my_waitlist_unguarded;
alter function public.feedback_photo_target(uuid) rename to feedback_photo_target_unguarded;
alter function public.set_feedback_photo(uuid, text) rename to set_feedback_photo_unguarded;

revoke execute on function
  public.create_booking_unguarded(uuid, date, smallint, smallint, text[], uuid),
  public.cancel_booking_unguarded(uuid),
  public.my_booking_pass_unguarded(uuid),
  public.check_out_unguarded(uuid, public.feedback_rating, text),
  public.join_waitlist_unguarded(uuid, date, smallint, smallint, text[]),
  public.leave_waitlist_unguarded(uuid),
  public.accept_offer_unguarded(uuid),
  public.my_waitlist_unguarded(),
  public.feedback_photo_target_unguarded(uuid),
  public.set_feedback_photo_unguarded(uuid, text)
  from public, anon, authenticated;

create function public.create_booking(
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

create function public.cancel_booking(p_booking_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform public.require_not_guard();
  return public.cancel_booking_unguarded(p_booking_id);
end;
$$;

create function public.my_booking_pass(p_booking_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform public.require_not_guard();
  return public.my_booking_pass_unguarded(p_booking_id);
end;
$$;

create function public.check_out(p_booking_id uuid, p_rating public.feedback_rating, p_description text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform public.require_not_guard();
  return public.check_out_unguarded(p_booking_id, p_rating, p_description);
end;
$$;

create function public.join_waitlist(
  p_resource_id         uuid,
  p_slot_date           date,
  p_slot_index          smallint,
  p_participant_count   smallint,
  p_participant_reg_nos text[]
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform public.require_not_guard();
  return public.join_waitlist_unguarded(
    p_resource_id, p_slot_date, p_slot_index, p_participant_count, p_participant_reg_nos);
end;
$$;

create function public.leave_waitlist(p_entry_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform public.require_not_guard();
  return public.leave_waitlist_unguarded(p_entry_id);
end;
$$;

create function public.accept_offer(p_entry_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform public.require_not_guard();
  return public.accept_offer_unguarded(p_entry_id);
end;
$$;

create function public.my_waitlist()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.require_not_guard();
  return public.my_waitlist_unguarded();
end;
$$;

create function public.feedback_photo_target(p_booking_id uuid)
returns uuid language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.require_not_guard();
  return public.feedback_photo_target_unguarded(p_booking_id);
end;
$$;

create function public.set_feedback_photo(p_feedback_id uuid, p_path text)
returns void language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform public.require_not_guard();
  perform public.set_feedback_photo_unguarded(p_feedback_id, p_path);
end;
$$;

-- Profile edits: guards keep the name and email an owner gave them, and can
-- never set a registration number (which would let them be listed as a
-- player). Both the direct table path and update_my_profile go through this.
drop policy profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and not (select public.has_role('guard')))
  with check (id = (select auth.uid()));

create or replace function public.update_my_profile(p_full_name text, p_reg_no text)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  _p public.profiles;
begin
  perform public.require_not_guard();
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

revoke execute on function
  public.require_not_guard(),
  public.create_booking(uuid, date, smallint, smallint, text[], uuid),
  public.cancel_booking(uuid),
  public.my_booking_pass(uuid),
  public.check_out(uuid, public.feedback_rating, text),
  public.join_waitlist(uuid, date, smallint, smallint, text[]),
  public.leave_waitlist(uuid),
  public.accept_offer(uuid),
  public.my_waitlist(),
  public.feedback_photo_target(uuid),
  public.set_feedback_photo(uuid, text)
  from public, anon, authenticated;

-- update_my_profile runs as the caller, so the caller needs the check too.
grant execute on function public.require_not_guard() to authenticated;
grant execute on function
  public.create_booking(uuid, date, smallint, smallint, text[], uuid),
  public.cancel_booking(uuid),
  public.my_booking_pass(uuid),
  public.check_out(uuid, public.feedback_rating, text),
  public.join_waitlist(uuid, date, smallint, smallint, text[]),
  public.leave_waitlist(uuid),
  public.accept_offer(uuid),
  public.my_waitlist(),
  public.feedback_photo_target(uuid),
  public.set_feedback_photo(uuid, text)
  to authenticated;
