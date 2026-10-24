"use client";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "./client";
import { isSupabaseConfigured } from "./env";

export type SessionStatus = "loading" | "signed-in" | "signed-out" | "unconfigured";

/** Client-side sign-in state for navigation and gating UI (not for authorization). */
export function useSessionStatus(): SessionStatus {
  const [status, setStatus] = useState<SessionStatus>(isSupabaseConfigured ? "loading" : "unconfigured");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setStatus(data.session ? "signed-in" : "signed-out"));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setStatus(session ? "signed-in" : "signed-out"));
    return () => data.subscription.unsubscribe();
  }, []);

  return status;
}
