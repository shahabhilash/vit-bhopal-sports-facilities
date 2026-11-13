-- Guards can see the day's bookings without scanning: for each facility,
-- court and slot, who booked it, its check-in state and every listed
-- player's registration number. Cancelled bookings are left out.
--
-- Limited to today and the next 7 days (IST), which covers the gate's
-- needs. No emails or account ids are returned.

create function public.guard_bookings(p_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.has_role('guard') or public.has_role('sports_admin')) then
    raise exception 'Only facility guards can see the booking list.' using errcode = '42501';
  end if;
  if p_date is null or p_date < public.ist_today() or p_date > public.ist_today() + 7 then
    raise exception 'Choose today or one of the next 7 days.' using errcode = 'VB005';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'facility', b.facility_code,
      'resource', r.name,
      'date', b.slot_date,
      'slotIndex', b.slot_index,
      'startsAt', public.iso_utc(b.starts_at),
      'status', b.status,
      'participants', b.participant_count,
      'ownerName', p.full_name,
      'ownerRegNo', p.reg_no,
      'playerRegNos', coalesce(to_jsonb(b.participant_reg_nos), '[]'::jsonb),
      'checkedInAt', public.iso_utc(b.checked_in_at)
    ) order by b.slot_index, f.sort_order, r.sort_order), '[]'::jsonb)
    from public.bookings b
    join public.facility_resources r on r.id = b.resource_id
    join public.facilities f on f.code = b.facility_code
    join public.profiles p on p.id = b.owner_id
    where b.slot_date = p_date
      and b.status <> 'cancelled'
  );
end;
$$;

revoke execute on function public.guard_bookings(date) from public, anon;
grant execute on function public.guard_bookings(date) to authenticated;
