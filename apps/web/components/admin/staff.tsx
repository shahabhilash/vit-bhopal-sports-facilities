"use client";
import { useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";
import { isAllowedEmail, normalizeEmail } from "@vitb/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice, Skeleton } from "@/components/ui/feedback";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { errorMessage } from "@/lib/api";
import { setStaffRole, useStaff } from "@/lib/admin";

const ROLE_LABEL: Record<string, string> = { guard: "Facility guard", sports_admin: "Sports administrator" };

export function AdminStaff({ selfEmail }: { selfEmail: string }) {
  const { data, error, loading } = useStaff();
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function grant(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const normalized = normalizeEmail(email);
    if (!isAllowedEmail(normalized)) {
      setFormError("Enter an @vitbhopal.ac.in address. The person must have signed in once already.");
      return;
    }
    setBusy(true);
    try {
      await setStaffRole(normalized, "guard", true);
      toast("success", "Guard access granted", normalized);
      setEmail("");
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(target: string, role: "guard" | "sports_admin") {
    try {
      await setStaffRole(target, role, false);
      toast("success", "Access removed", target);
    } catch (err) {
      toast("error", "Could not remove access", errorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={grant} noValidate className="space-y-2 rounded-xl border bg-card p-4 shadow-card">
        <Label htmlFor="staff-email">Give guard access</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="staff-email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="guard.gate1@vitbhopal.ac.in"
            aria-invalid={formError ? true : undefined}
            aria-describedby={formError ? "staff-error" : "staff-hint"}
          />
          <Button type="submit" size="lg" disabled={busy}>
            <UserPlus aria-hidden />
            {busy ? "Granting…" : "Grant"}
          </Button>
        </div>
        <FieldHint id="staff-hint">They must have signed in once so their account exists. Every change is logged.</FieldHint>
        {formError && <FieldError id="staff-error">{formError}</FieldError>}
      </form>

      {error ? (
        <Notice tone="danger">{errorMessage(error)}</Notice>
      ) : loading || !data ? (
        <Skeleton className="h-32" />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-card">
          {data.map((m) => (
            <li key={m.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <p className="font-semibold">{m.fullName ?? m.email}</p>
                <p className="break-all text-muted-foreground">{m.email}</p>
                <div className="mt-1 flex gap-2">
                  {m.roles.map((r) => (
                    <Badge key={r} tone={r === "sports_admin" ? "brand" : "info"}>
                      {ROLE_LABEL[r] ?? r}
                    </Badge>
                  ))}
                </div>
              </div>
              {m.roles.includes("guard") && (
                <Button variant="ghost" className="text-destructive" onClick={() => void revoke(m.email, "guard")}>
                  Remove guard access
                </Button>
              )}
              {m.roles.includes("sports_admin") && m.email === selfEmail && (
                <p className="text-sm text-muted-foreground">This is you</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
