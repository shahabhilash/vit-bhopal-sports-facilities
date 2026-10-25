import { z } from "zod";

const csv = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );

const origin = z
  .string()
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.origin === value && (url.protocol === "https:" || url.hostname === "localhost");
    } catch {
      return false;
    }
  }, "must be an exact origin such as https://sports.example.com (no path or trailing slash)");

const envSchema = z
  .object({
    APP_ENV: z.enum(["development", "preview", "production"]),
    PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    SUPABASE_URL: z.url(),
    // Publishable (anon) key: requests are made with the caller's JWT, so RLS applies.
    SUPABASE_ANON_KEY: z.string().min(20),
    // Server-only. Used solely for the private issue-photo bucket (upload and
    // short-lived signed URLs). Never expose it to the browser.
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
    // Only needed for projects still on the legacy shared-secret JWT signing.
    SUPABASE_JWT_SECRET: z.string().min(32).optional(),
    CORS_ALLOWED_ORIGINS: csv.pipe(z.array(origin)),
    // Anchored regular expressions for preview deployments, e.g.
    // ^https://vitb-sports-[a-z0-9-]+-myteam\.vercel\.app$
    CORS_ALLOWED_ORIGIN_PATTERNS: csv.pipe(
      z.array(
        z.string().refine((p) => p.startsWith("^https://") && p.endsWith("$"), "must start with ^https:// and end with $"),
      ),
    ),
    // Number of reverse proxies in front of the API that append to X-Forwarded-For.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(120),
    BODY_LIMIT_BYTES: z.coerce.number().int().min(1024).max(1_048_576).default(64 * 1024),
  })
  .refine((env) => env.APP_ENV !== "production" || env.CORS_ALLOWED_ORIGIN_PATTERNS.length === 0, {
    message: "CORS_ALLOWED_ORIGIN_PATTERNS is not allowed in production; list exact origins instead",
    path: ["CORS_ALLOWED_ORIGIN_PATTERNS"],
  })
  .refine(
    (env) => env.APP_ENV === "development" || env.CORS_ALLOWED_ORIGINS.every((o) => o.startsWith("https://")),
    { message: "Only https origins are allowed outside development", path: ["CORS_ALLOWED_ORIGINS"] },
  );

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    // Report which variables are wrong without echoing their values.
    const problems = result.error.issues.map((i) => `  ${i.path.join(".") || "(env)"}: ${i.message}`).join("\n");
    throw new Error(`Invalid API configuration:\n${problems}`);
  }
  return result.data;
}
