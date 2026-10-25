import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ApiError, type ErrorCode } from "@vitb/shared";
import type { Config } from "../config";
import type { AuthUser } from "./auth";

/**
 * Every database operation is a call to a Postgres function (see
 * supabase/migrations). The API never touches tables directly and never uses
 * the service-role key here: calls run as the signed-in user (their JWT), or
 * as `anon` for public reads, so RLS and the functions' own checks apply.
 */
export interface Db {
  rpc<T>(fn: string, args: Record<string, unknown>, user: AuthUser | null): Promise<T>;
}

const DB_CODES: Record<string, ErrorCode> = {
  VB001: "SLOT_TAKEN",
  VB002: "BOOKING_WINDOW_CLOSED",
  VB003: "FACILITY_BLOCKED",
  VB004: "LIMIT_REACHED",
  VB005: "VALIDATION_FAILED",
  VB006: "EMAIL_NOT_VERIFIED",
  VB007: "PROFILE_INCOMPLETE",
  VB008: "NOT_FOUND",
  VB009: "INVALID_STATE",
  VB010: "PARTICIPANT_CONFLICT",
  VB011: "OFFER_EXPIRED",
};

function parseDetail(detail: unknown): unknown {
  if (typeof detail !== "string" || !detail.startsWith("{")) return undefined;
  try {
    return JSON.parse(detail);
  } catch {
    return undefined;
  }
}

/**
 * Turns a Postgres error into an ApiError. Messages are passed through only
 * for our own VBxxx codes, which are written for students; everything else
 * gets a fixed message so table names and internals never reach a client.
 */
export function mapDbError(err: { code?: string; message?: string; details?: unknown; detail?: unknown }): Error {
  const code = err.code ?? "";
  const message = err.message ?? "";
  const mapped = DB_CODES[code];
  if (mapped) return new ApiError(mapped, message, parseDetail(err.details ?? err.detail));

  if (code === "42501") {
    if (/Registration number cannot be changed/.test(message)) {
      return new ApiError("FORBIDDEN", "Your registration number is already set. Contact the sports office to change it.");
    }
    return new ApiError("FORBIDDEN", "You do not have permission to do this.");
  }
  if (code === "23505" && /reg_no/.test(message)) {
    return new ApiError("CONFLICT", "That registration number is already linked to another account.");
  }
  if (code === "23514" && /reg_no/.test(message)) {
    return new ApiError("VALIDATION_FAILED", "Enter a registration number like 23BCE10001.");
  }
  if (code === "23514" && /full_name/.test(message)) {
    return new ApiError("VALIDATION_FAILED", "Enter a name of up to 100 characters.");
  }
  // Unexpected database error: surfaces as a generic 500 and is logged by the app.
  return new Error(`Database error ${code || "(no code)"}`);
}

export function createSupabaseDb(config: Pick<Config, "SUPABASE_URL" | "SUPABASE_ANON_KEY">): Db {
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const anon: SupabaseClient = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, options);

  return {
    async rpc<T>(fn: string, args: Record<string, unknown>, user: AuthUser | null) {
      const client = user
        ? createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
            ...options,
            global: { headers: { Authorization: `Bearer ${user.token}` } },
          })
        : anon;
      let result;
      try {
        result = await client.rpc(fn, args);
      } catch {
        throw new ApiError("SERVICE_UNAVAILABLE", "The booking service is not reachable. Please try again.");
      }
      if (result.error) {
        if (!result.error.code) {
          throw new ApiError("SERVICE_UNAVAILABLE", "The booking service is not reachable. Please try again.");
        }
        throw mapDbError(result.error);
      }
      return result.data as T;
    },
  };
}
