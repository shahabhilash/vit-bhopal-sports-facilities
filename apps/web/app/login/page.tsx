"use client";
import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isAllowedEmail, normalizeEmail } from "@vitb/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/field";
import { Notice } from "@/components/ui/feedback";
import { SIGN_IN_ERROR_TEXT, safeNext, type SignInError } from "@/lib/auth-redirect";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.7 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.5 5.8c4.4-4 6.8-10 6.8-17.1z" />
      <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z" />
      <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2.1 1.4-4.7 2.3-7.7 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.8 6C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
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
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const returnedError = params.get("error") as SignInError | null;
  const supabase = getSupabaseBrowserClient();
  const [redirecting, setRedirecting] = useState(false);

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

  async function continueWithGoogle() {
    if (!supabase) return;
    setError(null);
    setRedirecting(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        // Pre-selects college accounts in Google's chooser. The sign-up hook
        // still rejects every other domain, whatever Google returns.
        queryParams: { hd: "vitbhopal.ac.in", prompt: "select_account" },
      },
    });
    if (error) {
      setRedirecting(false);
      setError(SIGN_IN_ERROR_TEXT.failed);
    }
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
    <div className="space-y-5">
      {returnedError && SIGN_IN_ERROR_TEXT[returnedError] && (
        <Notice tone={returnedError === "cancelled" ? "info" : "danger"} live>
          {SIGN_IN_ERROR_TEXT[returnedError]}
        </Notice>
      )}
      <Button type="button" variant="outline" size="lg" className="w-full" onClick={continueWithGoogle} disabled={redirecting}>
        <GoogleLogo />
        {redirecting ? "Opening Google…" : "Continue with Google"}
      </Button>
      <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        or use an email code
        <span className="h-px flex-1 bg-border" />
      </div>
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
      <Button type="submit" size="lg" variant="secondary" className="w-full" disabled={busy}>
        {busy ? "Sending code…" : "Send code"}
      </Button>
    </form>
    </div>
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
