# Product decisions

Adopted on 2026-10-25 from the recommended defaults in [PHASE1_AUDIT.md](PHASE1_AUDIT.md) §7. Change a decision here first, then in code.

| # | Topic | Decision | Where it lives |
|---|---|---|---|
| Q1 | Turf unit | The whole turf is **one** bookable resource ("Full turf"). | `facility_resources` seed, `FACILITY_RULES.turf` |
| Q2 | Turf release | Turf weeks run **Saturday → Friday**. Each week opens at **Friday 12:00 IST** the day before it starts. A released date stays bookable until its slot begins. | `turfReleaseInstant()` (display); booking function (authority, Phase 4) |
| Q3 | Per-student limits | At most 1 active booking per sport per day. Turf: 1 booking per owner per turf week, and one person may appear in only one turf booking per slot. | Booking function + partial unique indexes (Phase 4) |
| Q4 | Pickleball/tennis horizon | Rolling 7 days including today; same-day booking until the slot starts. | `facilities.booking_horizon_days = 7` |
| Q5 | Pickleball/tennis size | 2–10 participants **per court booking**. | `facilities.min/max_participants` |
| Q6 | Turf participants | Every participant must be a verified portal user, looked up by registration number. No roster integration until one is provided; the UI must not claim roster validation. | Phase 4 |
| Q7 | Gym and recreation rooms | Information only; not bookable. | `facilities.bookable = false` |
| Q8 | Check-in window | Opens 10 minutes before the slot starts and closes 15 minutes after it starts. A check-in committed before `start + 15:00` counts. | Phase 5 |
| Q9 | Checkout | The student taps "Check out" (only after a guard check-in). Bookings still checked in at slot end are checked out automatically. The feedback prompt follows checkout. | Phase 5 |
| Q10 | Waiting list | Offers last 10 minutes when the release happens 2 h or more before the slot starts. Later releases (including no-shows) become first-come bookings instead of offers. Turf waitlist entries must include the full participant list. | Phase 5 |
| Q11 | Cancellation | Free cancellation until 1 hour before start. No penalties in v1; no-shows are recorded. | Phase 4/5 |
| Q12 | Sign-in | Supabase email OTP (6-digit code). No passwords. | `supabase/config.toml`, `/login` |
| Q13 | Registration number | Entered by the student once (format `23BCE10001`, unique, upper-cased). After that only staff tooling can change it. | `profiles.reg_no`, `profiles_guard_reg_no` trigger |
| Q14 | Retention | Checked-out bookings are deleted 10 days after `checked_out_at`; cancelled and no-show bookings 10 days after the slot ends. Feedback is kept. | Phase 7 |
| Q15 | Blocks over existing bookings | The admin sees the affected bookings and must confirm "cancel and notify". Nothing is deleted silently. | Phase 6 |
| Q16 | Faculty and coaches | Out of scope for v1. | — |
| Q17 | Repository layout | npm workspaces: `apps/web`, `apps/api`, `packages/shared`, `supabase/`. | Root `package.json` |

## Engineering decisions made in Phase 2

| Topic | Decision | Reason |
|---|---|---|
| Next.js version | Upgraded 14.2.3 → **16.4.2** (React 19). | Every 14.x and 15.x release still matches unpatched advisories in `npm audit`. 16.4.2 is the first release with none. |
| Critical writes | Postgres `SECURITY DEFINER` functions, called through the API with the user's JWT. | One transaction per booking decision; RLS still applies to every read. |
| API database access | The API calls Supabase **as the user** (their JWT plus the publishable key). No service-role key in Phase 2. | Least privilege; a bug in the API cannot read more than the user could. |
| API framework | Hono on Node 22, bundled with esbuild. | Small, typed, standard `Request`/`Response`, easy to test without a network. |
| Role checks | `public.has_role()` in SQL; the API re-checks roles through RLS with a 30 s cache. | Roles cannot be forged from JWT metadata. |
| Database tests | Vitest against **PGlite** (real Postgres compiled to WASM) plus a Supabase shim. | Runs anywhere without Docker. pgTAP against a real Supabase stack can be added in CI. |
