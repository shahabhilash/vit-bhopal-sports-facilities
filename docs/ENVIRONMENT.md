# Environment variables

Each environment (development, preview, production) has its **own Supabase project** and its own values. Secrets live only in the hosting provider's settings, never in the repository. `.env*` files are git-ignored except the `.env.example` templates.

## Frontend: `apps/web` (Vercel)

All three are **public**: Next.js inlines `NEXT_PUBLIC_*` into the browser bundle at build time, so changing them requires a redeploy.

| Variable | Example | Used by |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://abcd1234.supabase.co` | Supabase Auth in the browser, proxy session refresh, CSP `connect-src` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_…` (or the legacy anon JWT) | Same. Grants only what RLS allows the `anon`/`authenticated` roles. |
| `NEXT_PUBLIC_API_URL` | `https://vitb-sports-api.onrender.com` | `lib/api.ts`, CSP `connect-src` |

When the Supabase variables are missing, local `next dev` still renders pages. A production build returns **503** for protected pages instead of serving them.

## Backend: `apps/api` (Render)

| Variable | Secret? | Required | Description |
|---|---|---|---|
| `APP_ENV` | no | yes | `development`, `preview` or `production`. Production enables HSTS and forbids origin patterns. |
| `PORT` | no | no (8080) | Port the server listens on. |
| `SUPABASE_URL` | no | yes | Supabase project URL. The JWT issuer and JWKS URL are derived from it. |
| `SUPABASE_ANON_KEY` | no | yes | Publishable key. The API sends it together with the **caller's** JWT, so RLS applies. |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | for photos | Used only for the private `feedback-photos` bucket: uploading issue photos and creating 60-second signed links for the admin. Without it, photo upload and viewing return 503 and everything else works. Never give it a `NEXT_PUBLIC_` name or set it on Vercel. |
| `SUPABASE_JWT_SECRET` | **yes** | no | Only for projects still on the legacy HS256 shared secret. Leave unset when using JWT signing keys (recommended). |
| `CORS_ALLOWED_ORIGINS` | no | yes | Comma-separated **exact** origins, e.g. `https://sports.vitbhopal.ac.in`. `https` only outside development. `*`, paths and trailing slashes are rejected at startup. |
| `CORS_ALLOWED_ORIGIN_PATTERNS` | no | no | Preview only. Comma-separated regexes that must start with `^https://` and end with `$`, e.g. `^https://vitb-sports-[a-z0-9-]+-yourteam\.vercel\.app$`. Rejected when `APP_ENV=production`. |
| `TRUST_PROXY_HOPS` | no | no (0) | Number of proxies in front of the API that append to `X-Forwarded-For`. Set this to Render's proxy depth (normally `1`) so rate limits key on the real client address. |
| `RATE_LIMIT_PER_MINUTE` | no | no (120) | Per-user limit for signed-in `/v1/*` routes. |
| `RATE_LIMIT_PER_IP_PER_MINUTE` | no | no (3000) | Per client IP across all users, as a flood backstop. Kept high because campus Wi-Fi puts many students behind one public IP; it only works if `TRUST_PROXY_HOPS` matches the host so the real client IP is used. |
| `BODY_LIMIT_BYTES` | no | no (65536) | Maximum request body size. |

Invalid configuration stops the server at startup with a list of the offending variable **names** (values are never printed).

The service-role key bypasses row-level security, so the API uses it for nothing except the photo bucket; every other database call runs as the signed-in user.

## Supabase (dashboard settings, per project)

| Setting | Value |
|---|---|
| Auth → Providers → Email | Enabled; "Confirm email" on; OTP length 6; OTP expiry 600 s |
| Auth → Providers → Google | Enabled, with the Google OAuth client ID and secret (see [Google sign-in](#google-sign-in)) |
| Auth → Anonymous sign-ins | Off |
| Auth → Hooks → Before User Created | Postgres function `public.hook_before_user_created` |
| Auth → URL configuration → Site URL | The environment's frontend origin |
| Auth → URL configuration → Redirect URLs | That origin plus `/**`; for preview, the Vercel preview pattern |
| Auth → SMTP | **Custom SMTP provider (required).** The built-in sender is for testing only and is heavily rate-limited. |
| Auth → Email templates | "Confirm signup" and "Magic link" show `{{ .Token }}` (copy `supabase/templates/otp-code.html`) |
| Auth → Rate limits | Raise email/OTP limits above the expected Friday peak once custom SMTP is configured |

## Who owns which secret

| Secret | Stored in | Read by |
|---|---|---|
| Supabase database password | Supabase dashboard / password manager | Developers running `supabase db push` |
| `SUPABASE_JWT_SECRET` (legacy only) | Render | API |
| `SUPABASE_SERVICE_ROLE_KEY` | Render | API (photo bucket only) |
| SMTP credentials | Supabase Auth settings | Supabase Auth |
| Google OAuth client secret | Supabase Auth → Providers → Google | Supabase Auth |

## Google sign-in

Students can sign in with **Continue with Google** (their `@vitbhopal.ac.in` Google Workspace account) or with a 6-digit email code. Both create the same account, and Supabase links them when the email matches. Personal Gmail and every other domain are rejected by the sign-up hook, whichever method is used.

Set it up once per Supabase project:

1. **Google Cloud Console → APIs & Services → OAuth consent screen.** Best: ask the college's Google Workspace admin to create it in the college's Google Cloud organisation with user type **Internal**, so Google itself only offers `@vitbhopal.ac.in` accounts and no Google review is needed. Otherwise use **External** in your own project; the hook still blocks other domains. Scopes: `openid`, `email`, `profile` only.
2. **Credentials → Create OAuth client ID → Web application.**
   - Authorised JavaScript origins: the site origin, e.g. `https://sports.vitbhopal.ac.in` (and the staging origin).
   - Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
3. **Supabase → Authentication → Providers → Google:** enable it and paste the client ID and client secret.
4. **Supabase → Authentication → URL configuration → Redirect URLs:** make sure `https://<site>/auth/callback` is covered (the `https://<site>/**` entry already does this).

The secret lives only in Supabase. Neither the web app nor the API needs any Google variable.
