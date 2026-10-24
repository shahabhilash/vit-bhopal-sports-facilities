# Deployment

Three environments, each with its own Supabase project:

| Environment | Frontend (Vercel) | API (Leapcell) | Supabase project |
|---|---|---|---|
| development | `localhost:3000` | `localhost:8787` | local CLI stack or a `vitb-sports-dev` project |
| preview | Vercel preview deployments | `vitb-sports-api-preview` service | `vitb-sports-preview` |
| production | Vercel production domain | `vitb-sports-api` service | `vitb-sports-prod` |

Never point preview deployments at the production database.

## 1. Supabase

1. Create the project (region close to Bhopal, e.g. Mumbai `ap-south-1`).
2. Apply migrations from the repository root:

   ```bash
   npx supabase link --project-ref <project-ref>
   ```

   ```bash
   npx supabase db push
   ```

   Migrations live in `supabase/migrations/` and are applied in filename order. Never edit a migration that has been applied anywhere; add a new one.
3. Apply the dashboard settings listed in [ENVIRONMENT.md § Supabase](ENVIRONMENT.md#supabase-dashboard-settings-per-project). The **Before User Created** hook and **custom SMTP** are mandatory.
4. Bootstrap the sports administrator as described in [ROLES.md](ROLES.md).

## 2. API on Leapcell

| Setting | Value |
|---|---|
| Repository root | this repository |
| Runtime | Node.js 22 |
| Build command | `npm ci && npm run build -w @vitb/api` |
| Start command | `npm run start -w @vitb/api` |
| Port | `8080` (or the value of `PORT`) |
| Health check path | `/health` |
| Environment variables | see [ENVIRONMENT.md § Backend](ENVIRONMENT.md#backend-appsapi-leapcell) |

Before the first Friday turf release, confirm Leapcell's instance count, concurrency and request-timeout limits, and keep at least one instance warm so the noon rush does not hit a cold start. The in-memory rate limiter is per instance; correctness never depends on it, because the database enforces every booking rule.

## 3. Frontend on Vercel

| Setting | Value |
|---|---|
| Root directory | `apps/web` |
| Framework preset | Next.js |
| Install command | default (Vercel installs from the repository root because of npm workspaces) |
| Node.js version | 22.x |
| Environment variables | the three `NEXT_PUBLIC_*` values, set separately for Preview and Production |

After the first production deploy:

- add the production origin to the API's `CORS_ALLOWED_ORIGINS`;
- add the production origin as Supabase **Site URL** and `https://<domain>/**` as a redirect URL;
- for previews, set the preview API's `CORS_ALLOWED_ORIGIN_PATTERNS` to an anchored pattern for your Vercel team, and add the matching wildcard redirect URL in the preview Supabase project.

## 4. Verification before every production deploy

```bash
npm ci
```

```bash
npm run check
```

```bash
npm run build
```

`npm run check` runs type checks, lint, unit tests and the database RLS tests.
