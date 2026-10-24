# Roles and access

| Role | Who | How it is assigned |
|---|---|---|
| `student` | Every verified `@vitbhopal.ac.in` account | Automatically, by the `on_auth_user_created` trigger |
| `sports_admin` | `fr.sports@vitbhopal.ac.in` (and any delegate) | First admin: manual bootstrap below. Later admins: an existing admin calls `admin_set_role`. |
| `guard` | Facility verification staff | An admin calls `admin_set_role` |

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

## Guard accounts and the domain rule

Only `@vitbhopal.ac.in` addresses can sign up. If guards do not have institutional addresses, the college needs to issue them, for example a shared `guard.gate1@vitbhopal.ac.in` per post. **This is an open question** for the sports office; the code makes no exception for it.
