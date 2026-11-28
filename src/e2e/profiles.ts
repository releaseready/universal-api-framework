// Environment profiles for the API e2e suite. A profile names the one origin a run may reach and the HTTP methods it
// may use; remote origins come from the environment (never from code) and must be plain https.
type ProfileName = "local" | "dev" | "uat" | "prod-smoke";

export interface Profile {
  readonly name: ProfileName;
  readonly origin: string;
  readonly allowedMethods: readonly string[];
}

const READ_WRITE = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const REMOTE: Record<
  Exclude<ProfileName, "local">,
  { variable: string; methods: readonly string[] }
> = {
  dev: { variable: "API_E2E_DEV_ORIGIN", methods: READ_WRITE },
  uat: { variable: "API_E2E_UAT_ORIGIN", methods: READ_WRITE },
  // Production smoke never changes data.
  "prod-smoke": { variable: "API_E2E_PROD_SMOKE_ORIGIN", methods: ["GET"] },
};

function plainHttpsOrigin(value: string, variable: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(`${variable} is not a valid origin.`);
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new TypeError(
      `${variable} must be a plain https origin (no credentials, path, query or fragment).`,
    );
  }
  return url.origin;
}

/** Resolves a remote profile from the environment. The local profile is built by the test that owns its fixture. */
export function resolveProfile(
  name: string,
  env: Readonly<Record<string, string | undefined>>,
): Profile {
  if (!Object.hasOwn(REMOTE, name)) {
    throw new TypeError(`Unknown e2e profile: ${name}`);
  }
  const remote = REMOTE[name as keyof typeof REMOTE];
  const value = env[remote.variable];
  if (value === undefined || value === "") {
    throw new TypeError(`${remote.variable} must be set for profile ${name}.`);
  }
  return {
    name: name as ProfileName,
    origin: plainHttpsOrigin(value, remote.variable),
    allowedMethods: remote.methods,
  };
}
