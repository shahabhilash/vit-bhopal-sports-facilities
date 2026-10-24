"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@vitb/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, Skeleton } from "@/components/ui/feedback";
import { ApiRequestError, apiFetch } from "@/lib/api";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface Me {
  id: string;
  email: string;
  fullName: string | null;
  regNo: string | null;
  roles: Role[];
}

const ROLE_LABELS: Record<Role, string> = {
  student: "Student",
  sports_admin: "Sports administrator",
  guard: "Facility guard",
};

export default function AccountPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Me>("/v1/me")
      .then((data) => !cancelled && setMe(data))
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiRequestError && err.status === 401) {
          router.replace("/login?next=/account");
          return;
        }
        setError(err instanceof ApiRequestError ? err.message : "Could not load your account.");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function signOut() {
    await getSupabaseBrowserClient()?.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="container max-w-xl space-y-6 py-6 sm:py-10">
      <PageHeader title="Account" className="mb-0" />
      <Card>
        <CardHeader>
          <CardTitle>Your details</CardTitle>
        </CardHeader>
        <CardContent aria-live="polite">
          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">{error}</p>
          ) : !me ? (
            <div className="space-y-3" aria-label="Loading">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Name</dt>
              <dd>{me.fullName ?? "Not set"}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="break-all">{me.email}</dd>
              <dt className="text-muted-foreground">Registration no.</dt>
              <dd>{me.regNo ?? "Not set"}</dd>
              <dt className="text-muted-foreground">Access</dt>
              <dd>{me.roles.map((r) => ROLE_LABELS[r]).join(", ")}</dd>
            </dl>
          )}
        </CardContent>
      </Card>
      <Button variant="outline" size="lg" className="w-full" onClick={signOut}>
        Sign out
      </Button>
    </div>
  );
}
