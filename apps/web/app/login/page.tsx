"use client";
import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isAllowedEmail, normalizeEmail } from "@vitb/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/field";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** Only same-site relative paths, so ?next= cannot redirect off-site. */
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

function authErrorMessage(err: { status?: number; message?: string; code?: string }): string {
  if (err.status === 429 || err.code === "over_email_send_rate_limit") {
    return "Too many attempts. Please wait a few minutes before requesting another code.";
  }
  if (/vitbhopal/i.test(err.message ?? "")) return "Use your @vitbhopal.ac.in email address.";
  // Supabase reports wrong and expired codes with the same error.
  if (err.code === "otp_expired" || err.status === 403) {
    return "That code is incorrect or has expired. Check it, or request a new code.";
  }
  return "Something went wrong. Please try again.";
}

function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const supabase = getSupabaseBrowserClient();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const normalized = normalizeEmail(email);
    if (!isAllowedEmail(normalized)) {
      setError("Use your @vitbhopal.ac.in email address.");
      return;
    }
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: normalized, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) {
      setError(authErrorMessage(error));
      return;
    }
    setEmail(normalized);
    setStep("code");
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    setBusy(false);
    if (error) {
      setError(authErrorMessage(error));
      return;
    }
    router.replace(next);
    router.refresh();
  }

  if (!supabase) {
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        Sign-in is not configured for this environment. Set NEXT_PUBLIC_SUPABASE_URL and
        NEXT_PUBLIC_SUPABASE_ANON_KEY (see docs/ENVIRONMENT.md).
      </p>
    );
  }

  return step === "email" ? (
    <form onSubmit={sendCode} noValidate className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">College email</Label>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          placeholder="name.23bce10001@vitbhopal.ac.in"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : "email-hint"}
        />
        <FieldHint id="email-hint">We&apos;ll email you a 6-digit sign-in code.</FieldHint>
      </div>
      {error && <FieldError id="login-error">{error}</FieldError>}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? "Sending code…" : "Send code"}
      </Button>
    </form>
  ) : (
    <form onSubmit={verifyCode} noValidate className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="code">Code sent to {email}</Label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={10}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
          className="font-mono text-lg tracking-[0.4em]"
        />
      </div>
      {error && <FieldError id="login-error">{error}</FieldError>}
      <Button type="submit" size="lg" className="w-full" disabled={busy || code.length < 6}>
        {busy ? "Checking…" : "Sign in"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-full"
        onClick={() => {
          setStep("email");
          setCode("");
          setError(null);
        }}
      >
        Use a different email
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="container max-w-md py-8 sm:py-14">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>Only @vitbhopal.ac.in accounts can book facilities.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
