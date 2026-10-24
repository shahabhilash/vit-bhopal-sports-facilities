-- =============================================================================
-- Foundation: identity, roles, facility configuration.
--
-- Security model
--   * Every table has RLS enabled and explicit, minimal grants.
--   * Supabase's default "grant everything to anon/authenticated" is revoked
--     for objects created by this role, so a forgotten grant fails closed.
--   * Roles live in public.user_roles. Nobody can write that table directly;
--     sports admins use public.admin_set_role(), and the first admin is
--     bootstrapped manually (see docs/ROLES.md).
--   * Only @vitbhopal.ac.in addresses can create accounts. The rule is
--     enforced by the before-user-created auth hook, by the profile CHECK
--     constraint, and again by the API.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Fail-closed defaults for everything created by this role from here on.
-- ---------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('student', 'sports_admin', 'guard');
create type public.release_rule as enum ('rolling', 'weekly_friday_noon');

-- ---------------------------------------------------------------------------
-- Email domain rule. Must stay identical to isAllowedEmail() in packages/shared.
-- ---------------------------------------------------------------------------
create function public.is_allowed_email(email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    length(lower(btrim(email, E' \t\r\n'))) <= 254
      and lower(btrim(email, E' \t\r\n')) ~ '^[a-z0-9._%+-]+@vitbhopal\.ac\.in$',
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- Profiles: one row per auth user, created by trigger, never by the client.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique
              check (email = lower(email) and public.is_allowed_email(email)),
  full_name   text check (full_name is null or char_length(btrim(full_name)) between 1 and 100),
  -- VIT registration numbers look like 23BCE10001. Stored upper-case.
  reg_no      text unique check (reg_no is null or reg_no ~ '^[0-9]{2}[A-Z]{3,4}[0-9]{4,5}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is
  'Student/staff profile. Students may edit full_name, and reg_no only while it is empty.';

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
create table public.user_roles (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        public.app_role not null,
  granted_at  timestamptz not null default now(),
  granted_by  uuid references public.profiles (id) on delete set null,
  primary key (user_id, role)
);

create table public.role_changes (
  id          bigint generated always as identity primary key,
  user_id     uuid not null,
  role        public.app_role not null,
  action      text not null check (action in ('grant', 'revoke')),
  actor_id    uuid,
  created_at  timestamptz not null default now()
);

create index role_changes_user_idx on public.role_changes (user_id, created_at desc);

-- SECURITY DEFINER so RLS policies can call it without recursing into
-- user_roles' own policies.
create function public.has_role(_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = _role
  );
$$;

-- ---------------------------------------------------------------------------
-- Facility configuration (public, read-only for clients)
-- ---------------------------------------------------------------------------
create table public.facilities (
  code                  text primary key
                        check (code in ('pickleball', 'tennis', 'turf', 'gym', 'recreation')),
  name                  text not null,
  bookable              boolean not null,
  min_participants      smallint,
  max_participants      smallint,
  booking_horizon_days  smallint,
  release_rule          public.release_rule,
  sort_order            smallint not null default 0,
  check (
    not bookable
    or (min_participants >= 1 and max_participants >= min_participants and release_rule is not null)
  ),
  check (release_rule is distinct from 'rolling' or booking_horizon_days between 1 and 60)
);

create table public.facility_resources (
  id             uuid primary key default gen_random_uuid(),
  facility_code  text not null references public.facilities (code),
  name           text not null,
  sort_order     smallint not null default 0,
  is_active      boolean not null default true,
  unique (facility_code, name)
);

create index facility_resources_facility_idx on public.facility_resources (facility_code, sort_order);

create table public.time_slots (
  slot_index  smallint primary key check (slot_index between 1 and 12),
  start_time  time not null unique,
  end_time    time not null,
  check (end_time > start_time)
);

insert into public.facilities
  (code, name, bookable, min_participants, max_participants, booking_horizon_days, release_rule, sort_order)
values
  ('pickleball', 'Pickleball',       true,  2,    10,   7,    'rolling',            1),
  ('tennis',     'Tennis',           true,  2,    10,   7,    'rolling',            2),
  ('turf',       'Turf',             true,  10,   26,   null, 'weekly_friday_noon', 3),
  ('gym',        'Gym',              false, null, null, null, null,                 4),
  ('recreation', 'Recreation rooms', false, null, null, null, null,                 5);

insert into public.facility_resources (facility_code, name, sort_order) values
  ('pickleball', 'Court 1', 1),
  ('pickleball', 'Court 2', 2),
  ('tennis',     'Court 1', 1),
  ('tennis',     'Court 2', 2),
  ('turf',       'Full turf', 1);

insert into public.time_slots (slot_index, start_time, end_time)
select i, time '08:30' + (i - 1) * interval '1 hour', time '09:30' + (i - 1) * interval '1 hour'
from generate_series(1, 12) as i;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Students may set reg_no once; afterwards only staff tooling (service role)
-- can change it, which prevents swapping identities between bookings.
create function public.profiles_guard_reg_no()
returns trigger
language plpgsql
set search_path = ''
as $$
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
  return new;
end;
$$;

create trigger profiles_guard_reg_no
before update on public.profiles
for each row execute function public.profiles_guard_reg_no();

-- New auth user -> profile + default student role. raw_user_meta_data is
-- user-controlled, so only a bounded full_name is read from it; any "role"
-- key is deliberately ignored.
create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _name text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
begin
  if _name is not null and char_length(_name) > 100 then
    _name := null;
  end if;

  insert into public.profiles (id, email, full_name)
  values (new.id, lower(btrim(new.email)), _name);

  insert into public.user_roles (user_id, role)
  values (new.id, 'student');

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Keep profiles.email in sync. Because of the CHECK constraint this also
-- aborts any attempt to change an account's email to another domain.
create function public.handle_auth_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = lower(btrim(new.email))
  where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.handle_auth_user_email_change();

-- ---------------------------------------------------------------------------
-- Auth hook: reject sign-ups outside the college domain before the user row
-- exists. Enable it in the dashboard (Authentication -> Hooks) or config.toml.
-- ---------------------------------------------------------------------------
create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  _email text := event -> 'user' ->> 'email';
begin
  if coalesce((event -> 'user' ->> 'is_anonymous')::boolean, false) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Anonymous sign-in is not allowed.'));
  end if;

  if not public.is_allowed_email(_email) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Use your @vitbhopal.ac.in email address.'));
  end if;

  return '{}'::jsonb;
end;
$$;

-- ---------------------------------------------------------------------------
-- Role administration
-- ---------------------------------------------------------------------------
create function public.admin_set_role(target_email text, _role public.app_role, _grant boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _actor  uuid := (select auth.uid());
  _target uuid;
begin
  if _actor is null or not public.has_role('sports_admin') then
    raise exception 'Only a sports administrator can change roles'
      using errcode = '42501';
  end if;

  select p.id into _target
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.email = lower(btrim(target_email))
    and u.email_confirmed_at is not null;

  if _target is null then
    raise exception 'No verified account with that email'
      using errcode = 'P0002';
  end if;

  if not _grant and _role = 'sports_admin' and _target = _actor then
    raise exception 'You cannot remove your own administrator role'
      using errcode = '42501';
  end if;

  if _grant then
    insert into public.user_roles (user_id, role, granted_by)
    values (_target, _role, _actor)
    on conflict do nothing;
  else
    delete from public.user_roles where user_id = _target and role = _role;
  end if;

  if found then
    insert into public.role_changes (user_id, role, action, actor_id)
    values (_target, _role, case when _grant then 'grant' else 'revoke' end, _actor);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.user_roles         enable row level security;
alter table public.role_changes       enable row level security;
alter table public.facilities         enable row level security;
alter table public.facility_resources enable row level security;
alter table public.time_slots         enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_select_admin on public.profiles
  for select to authenticated
  using ((select public.has_role('sports_admin')));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy user_roles_select_own on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy user_roles_select_admin on public.user_roles
  for select to authenticated
  using ((select public.has_role('sports_admin')));

create policy role_changes_select_admin on public.role_changes
  for select to authenticated
  using ((select public.has_role('sports_admin')));

-- Facility configuration is not private: anyone may read it.
create policy facilities_read on public.facilities
  for select to anon, authenticated
  using (true);

create policy facility_resources_read on public.facility_resources
  for select to anon, authenticated
  using (is_active);

create policy time_slots_read on public.time_slots
  for select to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Grants (explicit and minimal)
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.user_roles, public.role_changes,
              public.facilities, public.facility_resources, public.time_slots
  from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, reg_no) on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select on public.role_changes to authenticated;
grant select on public.facilities, public.facility_resources, public.time_slots to anon, authenticated;

revoke execute on function
  public.is_allowed_email(text),
  public.has_role(public.app_role),
  public.set_updated_at(),
  public.profiles_guard_reg_no(),
  public.handle_new_auth_user(),
  public.handle_auth_user_email_change(),
  public.hook_before_user_created(jsonb),
  public.admin_set_role(text, public.app_role, boolean)
  from public, anon, authenticated;

grant execute on function public.has_role(public.app_role) to authenticated;
grant execute on function public.is_allowed_email(text) to anon, authenticated;
grant execute on function public.admin_set_role(text, public.app_role, boolean) to authenticated;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
grant execute on function public.is_allowed_email(text) to supabase_auth_admin;
