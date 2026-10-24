import { createClient } from "@supabase/supabase-js";
import { ApiError, ROLES, type Role } from "@vitb/shared";
import type { Config } from "../config";
import type { AuthUser } from "./auth";

export interface Profile {
  id: string;
  email: string;
  fullName: string | null;
  regNo: string | null;
}

/** Everything the API reads from Supabase, behind an interface so tests can fake it. */
export interface DataSource {
  getProfile(user: AuthUser): Promise<Profile | null>;
  getRoles(user: AuthUser): Promise<Role[]>;
}

/**
 * Talks to Supabase as the calling user (their JWT + the publishable key), so
 * every read is filtered by RLS. No service-role key is involved.
 */
export function createSupabaseDataSource(config: Pick<Config, "SUPABASE_URL" | "SUPABASE_ANON_KEY">): DataSource {
  const clientFor = (user: AuthUser) =>
    createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${user.token}` } },
    });

  return {
    async getProfile(user) {
      const { data, error } = await clientFor(user)
        .from("profiles")
        .select("id, email, full_name, reg_no")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw new ApiError("SERVICE_UNAVAILABLE", "Could not load your profile. Please try again.");
      return data && { id: data.id, email: data.email, fullName: data.full_name, regNo: data.reg_no };
    },

    async getRoles(user) {
      const { data, error } = await clientFor(user).from("user_roles").select("role").eq("user_id", user.id);
      if (error) throw new ApiError("SERVICE_UNAVAILABLE", "Could not check your permissions. Please try again.");
      return (data ?? []).map((row) => row.role).filter((r): r is Role => (ROLES as readonly string[]).includes(r));
    },
  };
}
