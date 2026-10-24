"use client";
import type { ApiErrorBody, ErrorCode } from "@vitb/shared";
import { getSupabaseBrowserClient } from "./supabase/client";
import { apiUrl } from "./supabase/env";

export class ApiRequestError extends Error {
  constructor(
    readonly code: ErrorCode | "NETWORK",
    message: string,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

/** Calls the Leapcell API with the current Supabase access token. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const supabase = getSupabaseBrowserClient();
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  if (!apiUrl || !token) {
    throw new ApiRequestError("UNAUTHENTICATED", "Sign in to continue.", 401);
  }

  let res: Response;
  try {
    res = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
  } catch {
    throw new ApiRequestError("NETWORK", "Could not reach the server. Check your connection and try again.", 0);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiRequestError(
      body?.error.code ?? "INTERNAL",
      body?.error.message ?? "Something went wrong. Please try again.",
      res.status,
      body?.error.requestId,
    );
  }
  return (await res.json()) as T;
}
