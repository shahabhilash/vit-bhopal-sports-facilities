# VIT Bhopal Sports Facilities

Booking portal for VIT Bhopal's pickleball courts, tennis courts and turf, with guard-verified QR check-in and a sports-office dashboard.

> **Status:** Phases 2 (foundations and security) and 3 (design system and mobile-first redesign) are complete. Booking screens still save to the browser only, and say so on screen, until the booking engine lands in Phase 4. See [docs/PHASE1_AUDIT.md](docs/PHASE1_AUDIT.md) for the plan.

## Layout

```
apps/web         Next.js 16 frontend (Vercel)
apps/api         Hono API on Node 22 (Leapcell)
packages/shared  Slots, facility rules, IST time helpers, email rule, error codes
supabase/        SQL migrations, local CLI config, email template, RLS tests
docs/            Audit, decisions, environment, deployment, roles
```

## Getting started

Requires Node.js 22+.

```bash
npm install
```

```bash
npm run dev:web
```

```bash
npm run dev:api
```

Copy `apps/web/.env.example` to `apps/web/.env.local` and `apps/api/.env.example` to `apps/api/.env`, then fill in your Supabase project's values ([docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)). Without Supabase values the web app still runs, but sign-in is disabled.

## Checks

```bash
npm run check
```

This runs type checks, ESLint, the shared and API unit tests, and the database tests. The database tests apply every migration to an in-memory Postgres (PGlite) and attack the RLS policies as anonymous, student, guard and admin users. No Docker is needed.

## Documentation

- [Phase 1 audit and plan](docs/PHASE1_AUDIT.md)
- [Product and engineering decisions](docs/DECISIONS.md)
- [Environment variables and Supabase settings](docs/ENVIRONMENT.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Roles and admin bootstrap](docs/ROLES.md)
- [Design system](docs/DESIGN_SYSTEM.md)
