export const ALLOWED_EMAIL_DOMAIN = "vitbhopal.ac.in";

// Must stay identical to public.is_allowed_email() in the database migrations.
// The whole address is anchored, so "x@vitbhopal.ac.in.example.com" and
// "x@sub.vitbhopal.ac.in" are rejected.
const ALLOWED_EMAIL_PATTERN = /^[a-z0-9._%+-]+@vitbhopal\.ac\.in$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAllowedEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return normalized.length <= 254 && ALLOWED_EMAIL_PATTERN.test(normalized);
}

// Must stay identical to the profiles.reg_no CHECK constraint.
const REG_NO_PATTERN = /^[0-9]{2}[A-Z]{3,4}[0-9]{4,5}$/;

/** Upper-cases and strips spaces, e.g. " 23bce 10001" -> "23BCE10001". */
export function normalizeRegNo(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function isValidRegNo(value: string): boolean {
  return REG_NO_PATTERN.test(normalizeRegNo(value));
}
