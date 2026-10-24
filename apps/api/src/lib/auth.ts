import {
  createRemoteJWKSet,
  errors as joseErrors,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";
import { ApiError, isAllowedEmail, normalizeEmail } from "@vitb/shared";
import type { Config } from "../config";

export interface AuthUser {
  id: string;
  email: string;
  /** The caller's raw access token, forwarded to Supabase so RLS applies. */
  token: string;
}

export type TokenVerifier = (token: string) => Promise<AuthUser>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Verifies Supabase access tokens: signature (JWKS, or the legacy shared
 * secret when configured), issuer, audience, expiry, and the college-domain
 * rule on the email claim.
 */
export function createTokenVerifier(
  config: Pick<Config, "SUPABASE_URL" | "SUPABASE_JWT_SECRET">,
  keySource?: JWTVerifyGetKey,
): TokenVerifier {
  const issuer = `${config.SUPABASE_URL.replace(/\/$/, "")}/auth/v1`;
  const jwks = keySource ?? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  const secret = config.SUPABASE_JWT_SECRET ? new TextEncoder().encode(config.SUPABASE_JWT_SECRET) : null;

  async function verify(token: string): Promise<JWTPayload> {
    const options = { issuer, audience: "authenticated", clockTolerance: 5 } as const;
    if (secret && decodeAlg(token) === "HS256") {
      return (await jwtVerify(token, secret, { ...options, algorithms: ["HS256"] })).payload;
    }
    return (await jwtVerify(token, jwks, { ...options, algorithms: ["ES256", "RS256", "EdDSA"] })).payload;
  }

  return async (token) => {
    let payload: JWTPayload;
    try {
      payload = await verify(token);
    } catch (err) {
      if (err instanceof joseErrors.JWTExpired) {
        throw new ApiError("UNAUTHENTICATED", "Your session has expired. Please sign in again.");
      }
      throw new ApiError("UNAUTHENTICATED", "Invalid access token.");
    }

    const sub = payload.sub;
    const email = typeof payload.email === "string" ? normalizeEmail(payload.email) : "";
    if (!sub || !UUID.test(sub) || payload.role !== "authenticated" || payload.is_anonymous === true) {
      throw new ApiError("UNAUTHENTICATED", "Invalid access token.");
    }
    if (!isAllowedEmail(email)) {
      throw new ApiError("EMAIL_DOMAIN_NOT_ALLOWED", "Only @vitbhopal.ac.in accounts can use this service.");
    }
    return { id: sub, email, token };
  };
}

function decodeAlg(token: string): string | undefined {
  try {
    const header = JSON.parse(Buffer.from(token.split(".")[0] ?? "", "base64url").toString("utf8"));
    return typeof header.alg === "string" ? header.alg : undefined;
  } catch {
    return undefined;
  }
}
