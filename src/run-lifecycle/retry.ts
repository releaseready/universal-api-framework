type HttpMethod =
  "GET" | "HEAD" | "OPTIONS" | "POST" | "PUT" | "PATCH" | "DELETE";

const READ_ONLY: readonly HttpMethod[] = ["GET", "HEAD", "OPTIONS"];

export interface RetryDecision {
  readonly retry: boolean;
  readonly reason?: "uncertain-outcome-not-safe-to-retry";
}

/** A modifying request whose response was lost is never repeated unless a safe-retry rule says so. */
export function decideRetry(request: {
  method: HttpMethod;
  uncertain: boolean;
  safeRetry: boolean;
}): RetryDecision {
  if (!request.uncertain) return { retry: false };
  if (READ_ONLY.includes(request.method) || request.safeRetry)
    return { retry: true };
  return { retry: false, reason: "uncertain-outcome-not-safe-to-retry" };
}
