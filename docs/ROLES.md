# Roles and access

| Role | Who | How it is assigned |
|---|---|---|
| `student` | Every verified `@vitbhopal.ac.in` account | Automatically, by the `on_auth_user_created` trigger |
| `sports_admin` | `fr.sports@vitbhopal.ac.in` (and any delegate) | First admin: manual bootstrap below. Later admins: an existing admin calls `admin_set_role`. |
| `guard` | Facility verification staff. **Check-in only** (see below). | An admin calls `admin_set_role` |

Roles are stored in `public.user_roles`. **No API role can write to that table.** Signing up with `fr.sports@vitbhopal.ac.in` grants nothing beyond `student`, and anything a user puts in their sign-up metadata (for example `"role": "sports_admin"`) is ignored.

## Bootstrapping the first sports administrator

1. Sign in once on the deployed site as `fr.sports@vitbhopal.ac.in`, so the account exists and its email is verified.
2. A project owner opens **Supabase → SQL Editor** (which runs as the database owner) for that environment and runs:

   ```sql
   insert into public.user_roles (user_id, role)
   select p.id, 'sports_admin'
   from public.profiles p
   join auth.users u on u.id = p.id
   where p.email = 'fr.sports@vitbhopal.ac.in'
     and u.email_confirmed_at is not null
   on conflict do nothing;

   insert into public.role_changes (user_id, role, action, actor_id)
   select id, 'sports_admin', 'grant', null
   from public.profiles where email = 'fr.sports@vitbhopal.ac.in';
   ```

3. Confirm the change: the account page shows "Sports administrator", or run `select * from public.user_roles where role = 'sports_admin';`.

## Granting and revoking guard access

Once an admin exists, roles change only through `public.admin_set_role(email, role, grant)`. It:

- refuses callers who are not `sports_admin` (SQLSTATE 42501);
- only targets accounts whose email has been verified;
- refuses to remove the caller's own `sports_admin` role;
- writes every change to `public.role_changes`.

Phase 6 adds an admin screen that calls it. Until then, a project owner adds guards in the SQL Editor with the same pattern as the bootstrap above (`'guard'` instead of `'sports_admin'`, and the guard's email).

## What a guard account can do

Scan passes and read the booking list (`guard_bookings`: today and the next 7 days, with each booking's registration numbers). Nothing else. An account holding `guard` (and not `sports_admin`) is refused, with SQLSTATE 42501, by every student action in the database: booking, cancelling, booking passes, checking out and feedback, issue photos, the waitlist, and editing its profile (including through the table directly). Migration `20261104090000_guard_only.sql` does this by renaming each of those functions to `*_unguarded`, with no client access, behind a wrapper that calls `require_not_guard()` first. Guards keep `guard_check_in`, `guard_bookings`, `my_profile` and the public availability reads.

The website matches: a guard sees only the guard page (**Scanner** and **Bookings** tabs) and **Sign out**, and any other page sends them back to `/guard`. The interface is a convenience; the database rules are what enforce it.

Granting `guard` to an existing student account takes away that student's booking features. Any booking they already hold still runs (no-show release and auto check-out are scheduled jobs), but they can no longer open its pass. Students can still list a guard's registration number as a turf player if the guard account has one; staff accounts created with a password never do, and cannot set one.

## Guard accounts and the domain rule

Only `@vitbhopal.ac.in` addresses can sign up. If guards do not have institutional addresses, the college needs to issue them, for example a shared `guard.gate1@vitbhopal.ac.in` per post. **This is an open question** for the sports office; the code makes no exception for it.

### Username and password sign-in for guards

Guards may not have a mailbox to receive codes, so the login page has a **Staff sign-in (guards)** form. The username is the part before `@`: `hplguard` signs in as `hplguard@vitbhopal.ac.in`. To create such an account, a project owner:

1. Opens **Supabase → Authentication → Users → Add user → Create new user**, enters `<username>@vitbhopal.ac.in` and a password, ticks **Auto Confirm User**, and clicks **Create user**.
2. Grants the guard role in the **SQL Editor** (as for the admin bootstrap):

   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'guard' from public.profiles where email = '<username>@vitbhopal.ac.in'
   on conflict do nothing;

   insert into public.role_changes (user_id, role, action, actor_id)
   select id, 'guard', 'grant', null from public.profiles where email = '<username>@vitbhopal.ac.in';
   ```

Choose an address the college has not issued to a real person: whoever controls a real mailbox at that address could also sign in to it with an email code or Google. Use a long, unique password per environment, and change it by **Authentication → Users → (user) → Reset password**, or by deleting and recreating the account.
