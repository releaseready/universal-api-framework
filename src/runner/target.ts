// The runner's safe-target rule. A loopback target needs no opt-in. Any other target must use https and its host must
// be listed exactly in RR_ALLOWED_TARGET_HOSTS (comma-separated, empty by default, no wildcards).

export class RunnerConfigError extends Error {
  override readonly name = "RunnerConfigError";
}

type Env = Readonly<Record<string, string | undefined>>;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function parseAllowedHosts(value: string | undefined): readonly string[] {
  const hosts = (value ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host !== "");
  if (hosts.some((host) => host.includes("*"))) {
    throw new RunnerConfigError(
      "RR_ALLOWED_TARGET_HOSTS must list exact hostnames: a wildcard is refused.",
    );
  }
  return hosts;
}

function parseTarget(value: string | undefined): URL {
  if (value === undefined || value === "") {
    throw new RunnerConfigError("RR_BASE_URL must be set.");
  }
  let target: URL;
  try {
    target = new URL(value);
  } catch {
    throw new RunnerConfigError("RR_BASE_URL is not a valid URL.");
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new RunnerConfigError("RR_BASE_URL must be an http or https URL.");
  }
  if (target.username !== "" || target.password !== "") {
    throw new RunnerConfigError("RR_BASE_URL must not contain credentials.");
  }
  return target;
}

/** Returns the target URL when the run may reach it; throws RunnerConfigError otherwise. */
export function resolveRunnerTarget(env: Env): URL {
  const target = parseTarget(env.RR_BASE_URL);
  const allowedHosts = parseAllowedHosts(env.RR_ALLOWED_TARGET_HOSTS);
  if (LOOPBACK_HOSTS.has(target.hostname)) {
    return target;
  }
  if (target.protocol !== "https:") {
    throw new RunnerConfigError(
      "A non-loopback target must use https; RR_BASE_URL is refused.",
    );
  }
  if (!allowedHosts.includes(target.hostname)) {
    throw new RunnerConfigError(
      "The target host is not listed in RR_ALLOWED_TARGET_HOSTS; it is refused.",
    );
  }
  return target;
}
