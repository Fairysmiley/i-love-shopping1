export function toUserFriendlyApiError(error: unknown, fallback: string): { message: string; status: number } {
  const raw = error instanceof Error ? error.message : "";
  const msg = raw.toLowerCase();

  if (msg.includes("unauthorized")) return { message: "Please sign in and try again.", status: 401 };
  if (msg.includes("rate limit")) return { message: "Too many requests right now. Please wait a moment and try again.", status: 429 };
  if (msg.includes("timed out") || msg.includes("timeout")) {
    return { message: "The AI service is taking too long to respond. Please try again in a few seconds.", status: 503 };
  }
  if (msg.includes("connection refused") || msg.includes("failed to fetch") || msg.includes("ollama")) {
    return { message: "AI service is temporarily unavailable. Please try again shortly.", status: 503 };
  }
  if (msg.includes("invalid") || msg.includes("required")) {
    return { message: raw || fallback, status: 400 };
  }

  return { message: fallback, status: 500 };
}
