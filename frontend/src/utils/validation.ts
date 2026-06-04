// Client-side validation for authentication forms. Mirrors the server-side
// rules (backend/src/auth/dto/auth.dto.ts) so users get immediate, helpful
// feedback; the server remains the source of truth and re-validates everything.

// Same composition rule enforced by the backend: 10+ chars with upper, lower,
// a number and a symbol.
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/;
const EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Email is required.';
  if (!EMAIL_RULE.test(v)) return 'Enter a valid email address.';
  return null;
}

/** Strong-password rule, used on register / reset where a new password is set. */
export function validateNewPassword(value: string): string | null {
  if (!value) return 'Password is required.';
  if (value.length < 10) return 'Password must be at least 10 characters.';
  if (!PASSWORD_RULE.test(value)) {
    return 'Include uppercase, lowercase, a number and a symbol.';
  }
  return null;
}

/** On login we only require that a password was entered (no strength check). */
export function validateLoginPassword(value: string): string | null {
  if (!value) return 'Password is required.';
  return null;
}

/** Second login step when 2FA is enabled. */
export function validateTwoFactorCode(value: string): string | null {
  if (!value.trim()) return 'Enter your 6-digit code or a recovery code.';
  return null;
}

export function validateRequired(value: string, label: string): string | null {
  if (!value.trim()) return `${label} is required.`;
  return null;
}

/** Registration CAPTCHA — required when VITE_RECAPTCHA_SITE_KEY is set. */
export function validateCaptchaToken(token: string | null, required: boolean): string | null {
  if (!required) return null;
  if (!token) return 'Please complete the CAPTCHA verification.';
  return null;
}

/** True when every value in the record is null (i.e. no errors). */
export function hasNoErrors(errors: Record<string, string | null>): boolean {
  return Object.values(errors).every((e) => !e);
}
