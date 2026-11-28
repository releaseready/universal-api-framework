// A fetch that reaches only a profile's approved origin with its allowed methods, never follows redirects and times
// out. Every check runs before a request is sent. Pass it as `fetchApi` to a generated client.
import type { Profile } from "./profiles.js";

const REQUEST_TIMEOUT_MS = 10_000;

export function createProfileFetch(
  profile: Profile,
): (input: string, init?: RequestInit) => Promise<Response> {
  return (input, init = {}) => {
    const target = new URL(input);
    if (
      target.origin !== profile.origin ||
      target.username ||
      target.password
    ) {
      return Promise.reject(
        new TypeError(
          `Blocked: ${target.origin} is not the approved origin for profile ${profile.name}.`,
        ),
      );
    }
    const method = (init.method ?? "GET").toUpperCase();
    if (!profile.allowedMethods.includes(method)) {
      return Promise.reject(
        new TypeError(
          `Blocked: method ${method} is not allowed for profile ${profile.name}.`,
        ),
      );
    }
    return fetch(target, {
      ...init,
      redirect: "error",
      signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  };
}
