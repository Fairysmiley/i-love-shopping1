import { VerifyPendingClient } from "./verify-pending-client";

/**
 * Full URL to Mailhog web UI as seen from the user's browser (e.g. http://localhost:8025).
 * Set in docker-compose for production-mode Next builds; optional in .env for local dev.
 */
function resolveMailhogPublicUrl(): string | undefined {
  const fromEnv =
    process.env.MAILHOG_PUBLIC_UI_URL?.trim() ||
    process.env.NEXT_PUBLIC_MAILHOG_URL?.trim();
  if (fromEnv) return fromEnv;
  // Evaluator-friendly default for local Docker setups.
  return "http://localhost:8025";
}

export default function VerifyPendingPage() {
  const mailhogUrl = resolveMailhogPublicUrl();
  return <VerifyPendingClient mailhogUrl={mailhogUrl} />;
}
