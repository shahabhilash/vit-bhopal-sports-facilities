/**
 * Where to send the user after signing in. Only same-site paths are allowed,
 * so a crafted ?next= link cannot redirect to another site. Browsers ignore
 * tabs and newlines in URLs and treat backslashes like slashes, so any of
 * those (which could turn "/x" into "//evil.example") are rejected outright.
 */
export function safeNext(value: string | null | undefined): string {
  if (!value || value.length > 512) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  if (/[\\\s\u0000-\u001f\u007f]/.test(value)) return "/";
  return value;
}

export type SignInError = "domain" | "cancelled" | "failed";

/** Turns an OAuth error returned to /auth/callback into a short code for the login page. */
export function classifyOAuthError(error: string | null, description: string | null): SignInError {
  if (/vitbhopal/i.test(description ?? "")) return "domain";
  if (error === "access_denied") return "cancelled";
  return "failed";
}

export const SIGN_IN_ERROR_TEXT: Record<SignInError, string> = {
  domain: "Use your @vitbhopal.ac.in Google account. Personal Gmail accounts can't sign in.",
  cancelled: "Google sign-in was cancelled. Try again, or use an email code instead.",
  failed: "Google sign-in didn't work. Try again, or use an email code instead.",
};
