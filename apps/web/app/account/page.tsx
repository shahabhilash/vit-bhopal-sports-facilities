"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { isValidRegNo, normalizeRegNo, type ProfileDto, type Role } from "@vitb/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Notice, PageHeader, Skeleton } from "@/components/ui/feedback";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { errorMessage } from "@/lib/api";
import { updateProfile, useProfile } from "@/lib/bookings";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useSessionStatus } from "@/lib/supabase/session";

const ROLE_LABELS: Record<Role, string> = {
  student: "Student",
  sports_admin: "Sports administrator",
  guard: "Facility guard",
};

function ProfileForm({ me }: { me: ProfileDto }) {
  const [fullName, setFullName] = useState(me.fullName ?? "");
  const [regNo, setRegNo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regError, setRegError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setRegError(null);
    const reg = normalizeRegNo(regNo);
    if (!me.regNo && reg && !isValidRegNo(reg)) {
      setRegError("Enter a registration number like 23BCE10001.");
      return;
    }
    setSaving(true);
    try {
      await updateProfile({
        fullName: fullName.trim() || undefined,
        regNo: !me.regNo && reg ? reg : undefined,
      });
      setRegNo("");
      toast("success", "Profile saved");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="full-name">Full name</Label>
        <Input id="full-name" autoComplete="name" maxLength={100} value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reg-no">Registration number</Label>
        {me.regNo ? (
          <>
            <p id="reg-no" className="font-mono text-base font-semibold">
              {me.regNo}
            </p>
            <FieldHint>To correct it, contact the sports office.</FieldHint>
          </>
        ) : (
          <>
            <Input
              id="reg-no"
              value={regNo}
              onChange={(e) => setRegNo(e.target.value)}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="23BCE10001"
              className="font-mono uppercase"
              aria-invalid={regError ? true : undefined}
              aria-describedby={regError ? "reg-no-error" : "reg-no-hint"}
            />
            <FieldHint id="reg-no-hint">Needed to book the turf or be listed as a player. You can set it once.</FieldHint>
            {regError && <FieldError id="reg-no-error">{regError}</FieldError>}
          </>
        )}
      </div>
      {error && (
        <Notice tone="danger" live>
          {error}
        </Notice>
      )}
      <Button type="submit" size="lg" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const session = useSessionStatus();
  const { data: me, error } = useProfile(session);

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
          {me && (
            <p className="text-sm text-muted-foreground">
              <span className="break-all">{me.email}</span> · {me.roles.map((r) => ROLE_LABELS[r as Role] ?? r).join(", ")}
            </p>
          )}
        </CardHeader>
        <CardContent aria-live="polite">
          {error ? (
            <Notice tone="danger">{errorMessage(error)}</Notice>
          ) : !me ? (
            <div className="space-y-3" aria-label="Loading">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <ProfileForm key={me.regNo ?? "none"} me={me} />
          )}
        </CardContent>
      </Card>
      <Button variant="outline" size="lg" className="w-full" onClick={signOut}>
        Sign out
      </Button>
    </div>
  );
}
