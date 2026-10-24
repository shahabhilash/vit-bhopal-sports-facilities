# Phase 1 Audit — VIT Bhopal Sports Facilities Portal

Audit date: 2026-10-25 · Commit audited: `329e11c` (branch `main`)

## 0. Headline

The repository is a **frontend-only UI prototype**. There is no Supabase project wiring, no backend, no database schema, no migrations, no authentication, no RLS, no CORS, no QR codes, no guard or admin interface, and no tests. All "bookings" live in the browser's `localStorage` under a hard-coded demo user.

That changes the shape of the work: Phases 2 and 4–7 are **new construction**, not repair. What is worth keeping is the page structure, routing, imagery, colour identity and a few UI patterns. No existing data can be lost, because no real data exists yet.

## 1. Current architecture

| Area | State |
|---|---|
| Framework | Next.js **14.2.3** (App Router), React 18, TypeScript `strict`, Tailwind 3.4 |
| Pages | `/` home, `/book`, `/check-in`, `/my-bookings`, `/access`, `/report` (not linked from nav) |
| Components | `navbar`, `footer`, `slider` (hero carousel), shadcn-style `button` and `card`; `toaster` is an empty stub; `theme-provider` is unused |
| Data | `data/facilities.ts` (4 facilities), `data/user.ts` (one demo user), `data/mock-bookings.ts` |
| Persistence | `lib/bookings.ts` → `localStorage["vitb_sports_bookings"]` |
| Backend / API | None (no `app/api`, no server actions, no separate service) |
| Supabase | None (no client, no env vars, no `supabase/` directory) |
| Env vars | None referenced anywhere; no `.env*` file present; `.gitignore` correctly ignores `.env*` |
| Deployment config | None (`next.config.mjs` is empty, no `vercel.json`, no Leapcell config) |
| Tests / lint config | No test framework, no ESLint config (so `next build` skips linting) |

### Verification actually run

| Check | Result |
|---|---|
| `tsc --noEmit` | ✅ passes |
| `next build` | ✅ passes **locally only** (see dependency defect D1) |
| `npm audit --omit=dev` | ❌ 3 vulnerabilities: **1 critical** (`next` ≤ 14.2.3 range), 2 high (`postcss`, `source-map-js`) |
| Manual browser check, 375×812 | Hero occupies the first 665 px, so no facility is visible above the fold; slot buttons are 40 px tall; no horizontal overflow on `/` or `/book` |

## 2. What works (preserve)

- Overall page set and routes — they map well onto the student journey.
- Booking flow entry from facility cards via `/book?sport=…` and the `key={sportParam}` remount trick that fixed soft-navigation state.
- The sage / cream / olive identity, Plus Jakarta Sans, the `cn()` + CVA component pattern and HSL CSS-variable tokens (good base for a design system).
- Facility photography and the gallery concept on `/access` (needs compression, not removal).
- Cancel-confirmation on My Bookings; the 5 MB / image-type checks in the checkout modal (as UX hints only — they must be repeated server-side).
- Strict TypeScript config.

## 3. Broken or incomplete

### Defects

| # | Where | Problem |
|---|---|---|
| D1 | `package.json` | `recharts` and `next-themes` are imported but **not declared**. They exist in `package-lock.json` and `node_modules`, so the lockfile and manifest are out of sync. A clean `npm ci` errors; a clean `npm install` prunes them and `/report` + `theme-provider` fail to build. **Vercel deploys will break.** |
| D2 | `next@14.2.3` | Critical advisories apply (includes the middleware authorization-bypass class of bugs). Must be upgraded before any auth is built on middleware. |
| D3 | `app/book/page.tsx:116`, `check-in:22`, `my-bookings:24` | "Today" is computed with `toISOString()` (UTC). Between 00:00 and 05:30 IST the app thinks it is still yesterday. |
| D4 | `app/book/page.tsx:12-18` | Slots are 06:00–21:00 for every facility (including gym) — not the required 12 slots 08:30–20:30. Past slots on today are selectable. |
| D5 | `app/book/page.tsx:56` | `endTime` is not zero-padded (`06:00` → `7:00`). |
| D6 | `app/book/page.tsx` | No availability check: unlimited people can book the same court/slot. No participant count, no turf participant list. |
| D7 | `app/book/page.tsx:76` | QR is a literal "QR CODE PLACEHOLDER". |
| D8 | `data/mock-bookings.ts:25-26` | `checkInTime` is `setHours(...).toString()` → an epoch-millisecond string, not ISO. |
| D9 | `app/check-in/page.tsx` | Students check **themselves** in — contradicts guard-verified QR check-in. Feedback text and ticket photo are discarded (never stored). Photo is "compulsory" for tickets, which contradicts the brief ("upload a photograph if relevant"). |
| D10 | `app/report/page.tsx:24-47` | Hard-coded fake chart data (weekly bar chart always fake; pie chart falls back to fake numbers). Page is unreachable from navigation. |
| D11 | `app/access/page.tsx:45-58` | Tabs "My sessions", "Player groups", "Reports" are decorative buttons with no behaviour. "Live occupancy", "0 currently inside", "Inactive" are static text implying real-time data. |
| D12 | `app/page.tsx:89-90`, `slider.tsx` | Homepage claims "real-time availability" and "check in instantly from your smartphone" — neither is true. |
| D13 | `components/navbar.tsx:35` | Active state for "Book a session" (`/#facilities`) can never match `pathname`. No login/account entry. |
| D14 | `data/facilities.ts` | Rules contradict the new spec (e.g. "Max 4 players per court" vs 2–10; hours 06:00–22:00). Turf is modelled as two "courts" with a comment admitting the semantics are undecided. |
| D15 | `components/ui/toaster.tsx`, `theme-provider.tsx`, `.dark` tokens | Stubs / dead code. The `.dark` palette is unrelated default shadcn blue. |
| D16 | `README.md` | Describes Recharts and Next Themes as part of the stack but neither is declared; says "frontend-only", which will soon be false. |

### Accessibility and mobile issues

- **Contrast fails WCAG AA.** Primary `#8FA866` with white text is about **2.6 : 1** (AA requires 4.5 : 1 for body text, 3 : 1 for large text). The same primary is used as small text on cream (the 10 px "SPORTS FACILITIES" tagline, ~2.4 : 1), and the `secondary` button variant puts sage text on pale sage (~2 : 1). The palette needs a darker "primary-strong" for text and filled buttons; `#8FA866` can stay as an accent or surface tint.
- Touch targets: default buttons and slot buttons are 40 px tall; slider dots are 8 px with no `aria-label`.
- Hero carousel auto-rotates every 4 s with no pause control and ignores `prefers-reduced-motion`; it is 600 px tall on phones and pushes booking below the fold.
- Checkout "modal" is a hand-rolled `div`: no `role="dialog"`, no focus trap, no Escape key, not scrollable on short screens. Radix Dialog is already installed but unused.
- Booking status is conveyed partly by colour only (the coloured strip on check-in cards).
- Uses `alert()` / `confirm()` for errors and destructive confirmation.
- Google Fonts are loaded with a render-blocking `<link>` plus an inline `style` instead of `next/font`.
- Images: `slider-1.JPG` is 3.5 MB, the turf PNG 2.3 MB, `gym-1.PNG` 2.0 MB. `next/image` resizes these at request time, but the originals should be compressed, and a filename with spaces (`Cinematic Rooftop Turf at Dusk.png`) should be renamed.

## 4. Security and data-integrity issues

Because there is no backend, **every rule is currently client-side only**. Specifically:

1. No authentication. Any visitor acts as `u_demo_123`.
2. No server-side domain restriction; the `@vitbhopal.ac.in` rule exists only in documentation.
3. No authorization or roles. There is no notion of `sports_admin` or `guard`.
4. Booking IDs are `Date.now()` + `Math.random()` — guessable, and `Math.random` is not cryptographic. They must not become QR tokens.
5. No concurrency control (`localStorage` read-modify-write).
6. Feedback and incident photos are never uploaded, so nothing leaks today — but nothing is stored either.
7. `next@14.2.3` critical vulnerability (D2).
8. No security headers configured (CSP, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`). The camera scanner will need `Permissions-Policy: camera=(self)`.

Nothing secret is committed: no keys, tokens or `.env` files were found in the tracked tree.

## 5. Database work needed

There is no existing schema, so everything is a new, version-controlled migration under `supabase/migrations/`. Proposed entities (refined in Phase 2):

| Table | Purpose / key constraints |
|---|---|
| `profiles` | `id = auth.users.id`, `email` (unique, lower-case, domain CHECK), `full_name`, `reg_no` (unique). **No role column** writable by the user. |
| `user_roles` | `(user_id, role)` with role ∈ `student, sports_admin, guard`. Writable only by the service role or an existing admin. |
| `facilities` | pickleball, tennis, turf (+ gym and recreation rooms as info-only, see decision Q7). Participant min/max, `release_rule`. |
| `facility_resources` | Court 1 / Court 2 per facility; turf as one or two resources (Q1). |
| `time_slots` | The 12 fixed slots (`slot_index` 1–12, `start_time`, `end_time`), so arbitrary times are impossible. |
| `bookings` | `resource_id`, `slot_date`, `slot_index`, `owner_id`, `status`, `qr_token_hash`, `checked_in_at`, `checked_out_at`, `idempotency_key`. **Partial unique index** on `(resource_id, slot_date, slot_index) WHERE status IN ('confirmed','checked_in')` is the double-booking guarantee. |
| `booking_participants` | `booking_id`, `profile_id` / `reg_no`, with denormalised `slot_date, slot_index` and a partial unique index so one person cannot be in two overlapping active bookings. |
| `waitlist_entries` / `waitlist_offers` | Server-assigned `created_at` / sequence; unique active entry per user per slot; offer `expires_at`. |
| `facility_blocks` | resource or facility scope, date range, slot set or full day, `reason` (public enum: HPL, maintenance, event), `admin_note` (admin-only column or separate table). |
| `feedback` | Independent of bookings: `facility_id`, `slot_date`, `rating` (`good`/`issue`), `description`, `photo_path`, `status`; `booking_id` nullable with `ON DELETE SET NULL` so retention deletion never removes feedback. |
| `booking_events` | Minimal lifecycle log (check-in, checkout, no-show) without personal data, used for analytics. |
| `daily_usage_stats` | Aggregated counters that survive the 10-day deletion. |

Critical writes (create, cancel, check-in, no-show release, offer accept) go through **`SECURITY DEFINER` Postgres functions** that lock and validate inside one transaction. Students get no direct INSERT/UPDATE grants on `bookings`.

Timed work runs with **`pg_cron` inside Supabase** (no-show sweep every minute, offer expiry, nightly retention), so it does not depend on the Leapcell instance being awake. The **turf Friday release does not need a job at all**: the booking function computes "is this slot inside the currently open window?" from `now() AT TIME ZONE 'Asia/Kolkata'`. That cannot be missed, run twice, or drift.

## 6. Proposed architecture (confirmed in Phase 2)

```
Vercel: Next.js (student, guard, admin UIs)
   │  supabase-js (anon key)  → Auth, own profile/bookings reads under RLS
   │  fetch + Bearer JWT     → Leapcell API
Leapcell: Node/TS API (Hono or Fastify + Zod)
   │  verifies Supabase JWT, checks role, rate-limits, calls DB functions
   │  generates signed photo URLs, QR verification
Supabase: Postgres (+RLS, functions, pg_cron), Auth, private Storage
```

Repository layout proposal: npm workspaces with `apps/web` (the current Next app moved with `git mv`), `apps/api`, `packages/shared` (Zod schemas, slot table, error codes) and `supabase/` (migrations, seed, pgTAP RLS tests). If you would rather not move the Next app, it can stay at the root with `api/`, `shared/` and `supabase/` beside it; the trade-off is clumsier type sharing.

**Email delivery is a launch blocker.** Supabase's built-in SMTP is rate-limited to a handful of emails per hour and is meant for testing only. Verification and OTP emails for hundreds of students need a custom SMTP provider configured in Supabase.

## 7. Conflicting or unspecified requirements (decisions needed)

| # | Question | My recommended default |
|---|---|---|
| Q1 | **Turf:** one bookable unit or two half-courts? 10–26 participants per booking suggests the whole pitch. | One unit ("Full turf"). |
| Q2 | **Turf window:** what exactly opens at Fri 12:00 IST? | Fixed window: Fri 12:00 IST opens **Sat 00:00 → next Fri 23:59** (7 days). The window stays open until next Friday 12:00, when the following week opens. |
| Q3 | **Per-student limits** (critical for the Friday rush): how many active bookings per student per day / week / sport? Can one student own more than one turf booking per week? | 1 active booking per sport per day; turf: 1 booking per owner per week, and a person may appear in only one turf booking per slot. |
| Q4 | **Pickleball/tennis booking horizon** — how far ahead, and same-day allowed? | Rolling 7 days, same-day allowed until the slot starts. |
| Q5 | Pickleball max 10 — per court booking? | Yes, per court booking. |
| Q6 | **Turf participants:** must every participant be a registered, verified portal user, or is a typed registration number enough? Is an official roster available? | Participants must be verified portal users (looked up by reg no). This blocks fake numbers and makes duplicate checks reliable. If no roster exists, say so explicitly in the UI. |
| Q7 | **Gym and recreation rooms:** the current flow lets students "book" a gym with invented hours, while `/access` says gyms need a time-limited entitlement from FR Sports. | Info-only for now (no booking); revisit once rules exist. |
| Q8 | **Check-in window** | Opens 10 min before start, closes at start + 15 min (no-show boundary, inclusive of check-ins committed before `start + 15:00`). |
| Q9 | **Checkout:** student self-checkout, guard scan, or automatic at slot end? | Student taps "Check out" (only after a guard check-in); auto-checkout at slot end if they forget. Feedback prompt follows. |
| Q10 | **Waiting-list offers:** acceptance window? Should no-show releases (already 15 min into a 60 min slot) be offered at all? | 10-minute offers for releases ≥ 2 h ahead; for later releases, first-come instant booking instead of offers. Turf waitlisters must have their full participant list ready when joining. |
| Q11 | **Cancellation cut-off** and any no-show penalty | Free cancellation until 1 h before start; no penalties in v1, but no-shows recorded. |
| Q12 | **Sign-in method** | Email OTP (6-digit code) via Supabase Auth. No passwords to reset, and it proves inbox ownership on every login. Google sign-in restricted to the domain is an option if VIT Bhopal mail runs on Google Workspace. |
| Q13 | **Registration number source** — entered by the student, or derived from the email if VIT Bhopal addresses embed it? | Derive when the format guarantees it; otherwise self-entered, unique, and editable only by admin after first save. |
| Q14 | **Retention for cancelled / no-show bookings** | Delete 10 days after the slot's end time; checked-out bookings 10 days after `checked_out_at`. |
| Q15 | **Blocks overlapping existing bookings** | Block creation lists the affected bookings and requires the admin to confirm an explicit "cancel and notify" step. Nothing is deleted silently. |
| Q16 | **Faculty / coaches** are mentioned in `PROJECT_SPECIFICATION.md` but not in the brief. | Out of scope for v1 (students only). |
| Q17 | **Repo layout** (section 6) | Move to npm workspaces. |

## 8. Prioritised implementation plan

Ordered by your priorities: correctness/security → concurrency → mobile UX → visual design → maintainability.

**Phase 2 — Foundations and security (next)**
1. Fix D1 (declare `recharts`, remove or declare `next-themes`), upgrade Next to a patched release, add an ESLint config, `npm audit` clean.
2. Restructure into workspaces; add `packages/shared` with the slot table, facility rules and error codes.
3. Supabase project setup for dev / preview / prod; migration 0001 (profiles, roles, facilities, resources, slots) with RLS on every table; pgTAP tests that run as anon, student, guard and admin.
4. Supabase Auth with email OTP; domain check enforced in a `before user created` auth hook **and** in the API (exact match after lower-casing and trimming: `local@vitbhopal.ac.in`, so `…@vitbhopal.ac.in.example.com` fails). Custom SMTP.
5. Leapcell API skeleton: JWT verification, role middleware, Zod validation, exact-origin CORS allowlist per environment, rate limiting, uniform error format, security headers. `docs/ENVIRONMENT.md` listing every variable and which service owns it.

**Phase 3 — Design system and mobile-first redesign**
6. Tokens: accessible primary shade, type scale, spacing, radii and shadows; `next/font`; Radix Dialog, Tabs and Toast wired up; 44 px minimum targets; reduced-motion support.
7. Student shell with a bottom tab bar on mobile (Home · Book · My bookings · Account); compact hero so facilities are visible on the first screen; honest copy only.
8. Booking screen: date strip plus two-column slot grid with available / selected / booked / blocked / past / loading states that carry text labels, not just colour.

**Phase 4 — Booking engine**
9. `bookings` and `booking_participants` migrations with partial unique indexes; `create_booking` function (window, block, limit and participant checks, idempotency key); `cancel_booking`.
10. Availability endpoint (one query per facility and date range); UI wired to it. Remove `localStorage`.

**Phase 5 — Check-in, QR, waiting list**
11. QR = random 256-bit token (only its hash stored); student QR screen; guard scanner page; `verify_and_check_in` function with atomic `UPDATE … WHERE status = 'confirmed'`.
12. `pg_cron` no-show sweep; waiting list plus offer flow per Q10.

**Phase 6 — Admin and feedback**
13. Admin dashboard: analytics from aggregated views (bookings versus actual check-ins clearly labelled), blocks CRUD with overlap preview, feedback inbox with filters and status updates.
14. Checkout feedback (Good / Issue) with private bucket uploads (MIME and magic-byte check, 5 MB limit), staff viewing through short-lived signed URLs.

**Phase 7 — Automation and retention**
15. Retention job (10 days), aggregate roll-ups, orphan-photo cleanup, job-failure logging and alerts.

**Phase 8 — Verification and deployment**
16. Unit, integration and pgTAP suites; Playwright mobile flows; k6 load test of about 1,000 clients against a **staging** deployment at a simulated Friday release; Vercel + Leapcell + Supabase production rollout and runbook.

## 9. What I did not change

Nothing in the application was modified. The only addition is this report.
