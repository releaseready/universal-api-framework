// Exports a customer-owned TypeScript/Axios SDK bundle from one validated, normalized OpenAPI version: generated
// client (pinned OpenAPI Generator `typescript-axios`), starter contract tests for the selected reviewed cases,
// config template with placeholders only, README, omissions report and a manifest with a deterministic artifact hash.
// Examples and servers are stripped before generation so no sample value or credential reaches the bundle, and the
// specification itself is never copied in. Nothing here publishes, activates CI or contacts a target.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import canonicalize from "canonicalize";
import { sha256 } from "../versioning/hash.js";

interface CaseRef {
  readonly caseId: string;
  readonly revision: number;
}

export interface ExportRequest {
  /** Normalized, already validated OpenAPI 3.0 JSON text. */
  readonly specSource: string;
  readonly specHash: string;
  readonly specVersion: string;
  readonly cases: readonly CaseRef[];
  readonly outDir: string;
}

interface Omission {
  readonly construct: string;
  readonly operationId: string;
}

export interface ExportResult {
  readonly artifactHash: string;
  readonly omissions: readonly Omission[];
}

const GENERATOR = "typescript-axios";
// Source runs from src/export, the build from dist/src/export; the repo root is the nearest folder with the pin file.
function findRoot(from: string): string {
  return existsSync(join(from, "openapitools.json"))
    ? from
    : findRoot(resolve(from, ".."));
}
const root = findRoot(import.meta.dirname);
const require = createRequire(import.meta.url);
const versionOf = (name: string): string =>
  (require(`${name}/package.json`) as { version: string }).version;
const generatorVersion = (
  JSON.parse(readFileSync(join(root, "openapitools.json"), "utf8")) as {
    "generator-cli": { version: string };
  }
)["generator-cli"].version;

// The generator does not model these; they are reported instead of silently dropped.
const OMITTED_CONSTRUCTS = ["callbacks"] as const;
const GENERATOR_BOOKKEEPING = [
  ".openapi-generator",
  ".openapi-generator-ignore",
  "git_push.sh",
  ".gitignore",
  ".npmignore",
  "docs",
];
const METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
];

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Drops `example`, `examples` and `servers`; a schema property that is itself named `example` is kept. */
function strip(node: unknown, inPropertyMap = false): unknown {
  if (Array.isArray(node)) return node.map((n) => strip(n));
  if (!isObject(node)) return node;
  return Object.fromEntries(
    Object.entries(node)
      .filter(
        ([key]) =>
          inPropertyMap || !["example", "examples", "servers"].includes(key),
      )
      .map(([key, child]) => [
        key,
        strip(child, !inPropertyMap && key === "properties"),
      ]),
  );
}

function omissionsOf(doc: Json): Omission[] {
  const found: Omission[] = [];
  const paths = isObject(doc.paths) ? doc.paths : {};
  for (const [path, item] of Object.entries(paths)) {
    if (!isObject(item)) continue;
    for (const method of METHODS) {
      const op = item[method];
      if (!isObject(op)) continue;
      const operationId =
        typeof op.operationId === "string"
          ? op.operationId
          : `${method.toUpperCase()} ${path}`;
      for (const construct of OMITTED_CONSTRUCTS) {
        if (op[construct] !== undefined) found.push({ construct, operationId });
      }
    }
  }
  return found.sort((a, b) =>
    (a.operationId + a.construct).localeCompare(b.operationId + b.construct),
  );
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)))
    .sort();
}

function write(outDir: string, file: string, content: string): void {
  const path = join(outDir, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function generateClient(spec: string, sdkDir: string): void {
  const scratch = mkdtempSync(join(tmpdir(), "uaf-export-"));
  try {
    const specPath = join(scratch, "spec.json");
    writeFileSync(specPath, spec);
    execFileSync(
      join(root, "node_modules", ".bin", "openapi-generator-cli"),
      [
        "generate",
        "--generator-name",
        GENERATOR,
        "--input-spec",
        specPath,
        "--output",
        sdkDir,
        "--global-property",
        "apis,models,supportingFiles",
        "--additional-properties",
        "supportsES6=true,withSeparateModelsAndApi=true,apiPackage=api,modelPackage=model",
      ],
      { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
    );
    for (const entry of GENERATOR_BOOKKEEPING)
      rmSync(join(sdkDir, entry), { recursive: true, force: true });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const contractTests = (cases: readonly CaseRef[]): string =>
  `// Starter contract tests for reviewed cases. Replace each todo with a check that runs through the generated
// client in ../sdk against a target you have approved. These are contract checks, not complete business E2E tests.
import { describe, it } from "node:test";

describe("Reviewed contract cases", () => {
${cases.map((c) => `  it.todo(${JSON.stringify(`[${c.caseId}] revision ${String(c.revision)}`)});`).join("\n")}
});
`;

const readme = (
  specVersion: string,
): string => `# Customer API SDK (API version ${specVersion})

TypeScript/Axios client generated from your reviewed OpenAPI version, plus starter contract tests. It runs locally or
in your own CI; no ReleaseReady account or hosted runtime is needed.

## Use

1. \`npm install\` (dependency versions are pinned in package.json).
2. \`npm run typecheck\` to confirm the SDK builds on its own.
3. Copy \`.env.example\` to \`.env\` and fill it in on your side. Secrets come only from your environment or CI secret
   store; never commit them.
4. \`npm test\` runs the starter tests in \`tests/\`.

## Before you run anything against a target

- Allow-list the exact target origin and methods you approve; the SDK does not do this for you.
- Approve each run explicitly. Nothing in this bundle contacts a target on its own.
- Bound request rates and timeouts, and keep production off unless you scope it deliberately.
- Redact credentials and personal data from reports before sharing them.

## Known gaps

See \`omissions.json\` for constructs the generator does not cover. Contract checks are not complete business
end-to-end tests. Generated code is licensed under the OpenAPI Generator and Axios licences (Apache-2.0 and MIT);
keep their notices if you redistribute it.
`;

export function exportSdkBundle(request: ExportRequest): ExportResult {
  const doc = JSON.parse(request.specSource) as Json;
  const omissions = omissionsOf(doc);
  const spec = canonicalize(strip(doc)) ?? "";
  generateClient(spec, join(request.outDir, "sdk"));

  const axios = versionOf("axios");
  write(request.outDir, "tests/contract.test.ts", contractTests(request.cases));
  write(request.outDir, "README.md", readme(request.specVersion));
  write(request.outDir, ".env.example", "API_BASE_URL=\nAPI_TOKEN=\n");
  write(
    request.outDir,
    "omissions.json",
    `${JSON.stringify(omissions, null, 2)}\n`,
  );
  write(
    request.outDir,
    "package.json",
    `${JSON.stringify(
      {
        name: "customer-api-sdk",
        version: request.specVersion,
        private: true,
        type: "module",
        scripts: {
          typecheck: "tsc --noEmit",
          test: "node --test --experimental-strip-types tests/",
        },
        dependencies: { axios },
        devDependencies: {
          typescript: versionOf("typescript"),
          "@types/node": versionOf("@types/node"),
        },
      },
      null,
      2,
    )}\n`,
  );
  write(
    request.outDir,
    "tsconfig.json",
    `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          lib: ["ES2022", "DOM"],
          types: ["node"],
          strict: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ["sdk", "tests"],
      },
      null,
      2,
    )}\n`,
  );

  const artifactHash = sha256(
    listFiles(request.outDir)
      .map(
        (file) =>
          `${file}\u0000${sha256(readFileSync(join(request.outDir, file), "utf8"))}\n`,
      )
      .join(""),
  );
  write(
    request.outDir,
    "manifest.json",
    `${JSON.stringify(
      {
        specVersion: request.specVersion,
        specHash: request.specHash,
        cases: request.cases,
        generator: { name: GENERATOR, version: generatorVersion },
        runtime: { axios },
        artifactHash,
      },
      null,
      2,
    )}\n`,
  );
  return { artifactHash, omissions };
}
