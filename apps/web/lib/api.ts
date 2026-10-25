"use client";
import type { ApiErrorBody, ErrorCode } from "@vitb/shared";
import { getSupabaseBrowserClient } from "./supabase/client";
import { apiUrl } from "./supabase/env";

export class ApiRequestError extends Error {
  constructor(
    readonly code: ErrorCode | "NETWORK" | "NOT_CONFIGURED",
    message: string,
    readonly status: number,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

export const isApiConfigured = Boolean(apiUrl);

interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Multipart upload; sent as-is (the browser sets the boundary). */
  form?: FormData;
  /** Send the signed-in user's access token. */
  auth?: boolean;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

/** Calls the booking API. Throws ApiRequestError with the server's code and message. */
export async function apiFetch<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  if (!apiUrl) {
    throw new ApiRequestError("NOT_CONFIGURED", "Booking is not available in this environment yet.", 0);
  }
  const headers: Record<string, string> = {};
  if (opts.body !== undefined && !opts.form) headers["Content-Type"] = "application/json";
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  if (opts.auth) {
    const token = (await getSupabaseBrowserClient()?.auth.getSession())?.data.session?.access_token;
    if (!token) throw new ApiRequestError("UNAUTHENTICATED", "Sign in to continue.", 401);
    headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${apiUrl}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.form ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiRequestError("NETWORK", "Could not reach the server. Check your connection and try again.", 0);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiRequestError(
      body?.error.code ?? "INTERNAL",
      body?.error.message ?? "Something went wrong. Please try again.",
      res.status,
      body?.error.details,
      body?.error.requestId,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.";
}
