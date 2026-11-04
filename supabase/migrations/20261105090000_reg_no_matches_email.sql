-- Security fixes from the pre-deployment review.
--
-- 1. A student could set any unused registration number, including
-- another student's, which locks the real owner out and makes turf bookings
-- that list that number resolve to the wrong person.
--
-- College emails carry the registration number (name.23bce10001@vitbhopal.ac.in).
-- When the caller's email has one, the registration number they set must be
-- that one. Accounts whose email has none (staff addresses) are unchanged.
-- Staff tooling (the SQL editor, service role) is not restricted.
--
-- 2. Anonymous visitors could read which admin created each facility block.

create function public.reg_no_from_email(email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper((regexp_match(lower(email), '\.([0-9]{2}[a-z]{3,4}[0-9]{4,5})@vitbhopal\.ac\.in$'))[1])
$$;

create or replace function public.profiles_guard_reg_no()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  _from_email text;
begin
  if new.reg_no is not null then
    new.reg_no := upper(btrim(new.reg_no));
  end if;
  if current_user = 'authenticated'
     and old.reg_no is not null
     and new.reg_no is distinct from old.reg_no then
    raise exception 'Registration number cannot be changed once set'
      using errcode = '42501';
  end if;
  -- Malformed values are left to the CHECK constraint's own error.
  if current_user = 'authenticated'
     and new.reg_no is distinct from old.reg_no
     and new.reg_no ~ '^[0-9]{2}[A-Z]{3,4}[0-9]{4,5}$' then
    _from_email := public.reg_no_from_email(new.email);
    if _from_email is not null and new.reg_no <> _from_email then
      raise exception 'Your registration number must match your college email (%).', _from_email
        using errcode = 'VB005';
    end if;
  end if;
  return new;
end;
$$;

-- Blocks are public so anyone can see closures, but which admin created one
-- is not. Reads go through get_availability / admin_blocks (definer), so
-- clients only lose the created_by column.
revoke select on public.facility_blocks from anon, authenticated;
grant select (id, facility_code, resource_id, start_date, end_date, slot_indexes, reason, created_at)
  on public.facility_blocks to anon, authenticated;

revoke execute on function public.reg_no_from_email(text) from public, anon, authenticated;
-- The trigger runs as the caller.
grant execute on function public.reg_no_from_email(text) to authenticated;
