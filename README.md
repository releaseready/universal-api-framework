# Universal API Framework

A standalone **local-only TypeScript API smoke scaffold** for the bounded
preparation slice of [RRDAPI-8](https://noisegatemusicstudios.atlassian.net/browse/RRDAPI-8).
This is not a customer API runner or evidence of customer API behavior.

This repository owns API testing across the BuildProveShip frameworks (native `fetch` and
k6). [universal-playwright-framework](https://github.com/buildproveship/universal-playwright-framework)
is browser-only and has no API client.

## Setup and run

Install k6 0.54.0 for the performance tests (`brew install k6`, the
[official packages](https://grafana.com/docs/k6/latest/set-up/install-k6/), or
the official apt package in CI) and the Node.js version that `package.json`
`engines` requires (with npm), then run from the repository root:

```sh
npm ci
npm run check
```

`npm run check` is the one command that must pass before a change merges. It runs
`typecheck` (strict TypeScript over `src`, the tests, the performance harness and
the k6 scripts), `lint` (ESLint with type-checked typescript-eslint rules),
`format:check` (Prettier), `npm test` and `npm run test:performance`.

Dependency installation needs access to the npm registry. After installation,
type checking and smoke execution need no remote service, credentials, environment
variables, account, Docker, or cloud infrastructure. Pull requests run the shared `ci` checks and, when the runner image files change, the path-filtered runner image build (below). The performance suites and the code-quality scan start manually or on a schedule.

`npm test` compiles the TypeScript and runs Node's built-in BDD test runner with
readable Given/When/Then scenario names. `npm run build` only compiles. Generated
JavaScript lives in the ignored `dist/` directory; `npm test` runs the compiled
test files.

## Runner image

`Dockerfile` packages the framework as a one-shot runner: it runs a suite against a target API, writes reports and
exits with the result code. It is for the phase 1 UAT EC2 (or an on-demand GitHub Actions job); there is no always-on
runner. Build it with the GitHub Packages token as a BuildKit secret (never a build argument):

```sh
docker build --secret id=npmrc,src=$HOME/.npmrc -t api-runner .
docker run --rm --read-only --tmpfs /tmp -e RR_BASE_URL=http://127.0.0.1:8080 -v "$PWD/out:/out" api-runner
```

| Env var                   | Required                           | Meaning                                                                   |
| ------------------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| `RR_BASE_URL`             | yes                                | Target API URL (no credentials).                                          |
| `RR_ALLOWED_TARGET_HOSTS` | yes, if the target is non-loopback | Comma-separated exact hostnames. Empty by default; wildcards are refused. |
| `RR_SUITE`                | no                                 | Glob of compiled test files. Default `dist/tests/smoke.test.js`.          |
| `RR_RUN_ID`               | no                                 | Run folder name. Default a generated UUID.                                |
| `RR_OUT_DIR`              | no                                 | Output root. Default `/out`.                                              |

Safety rules for the target: a loopback target (`127.0.0.1`, `localhost`, `[::1]`) needs no opt-in. Any other target
must use https and its host must match an `RR_ALLOWED_TARGET_HOSTS` entry exactly; otherwise the run exits 2 before any
request. Tokens are read from the environment only and are never logged.

Output: `$RR_OUT_DIR/$RR_RUN_ID/` holds `junit.xml`, `spec.txt` and `summary.json` (totals, duration, target origin only).
Exit codes: `0` passed, `1` failures (or no test ran), `2` config error (including a refused target).

The image runs as the non-root `node` user, is compatible with a read-only root filesystem (it writes only to `/tmp` and
`RR_OUT_DIR`) and pins `node:24-bookworm-slim` by digest. `.github/workflows/docker.yml` builds `linux/amd64` on pull
requests (Trivy scan, smoke run) and `linux/arm64` on `main`; it pushes to ECR only when the repository variable
`AWS_ECR_PUSH_ROLE_ARN` is set.

## What the smoke tests prove

Each run starts its own owned synthetic HTTP API on IPv4 loopback (`127.0.0.1`)
with an OS-assigned ephemeral port, awaits readiness, and closes it after the
suite, including assertion failures. The HTTP client sends requests only to the
fixture origin explicitly configured for that client. It rejects non-loopback,
different-origin and redirect destinations before they can receive a request.
Requests have a five-second timeout; the suite has a 15-second timeout. Runs
use fixed fixture data and no persistent state.

| Given the local synthetic API | When                     | Then                                                               |
| ----------------------------- | ------------------------ | ------------------------------------------------------------------ |
| It is listening               | `GET /health`            | HTTP 200, JSON, exact synthetic identity                           |
| The fixed widget exists       | `GET /widgets/widget-1`  | HTTP 200, JSON, exact ID, name and active flag                     |
| A widget does not exist       | `GET /widgets/missing`   | HTTP 404, unsuccessful response and exact JSON error               |
| Writes are unsupported        | `POST /widgets/widget-1` | HTTP 405, unsuccessful response, `Allow: GET` and exact JSON error |

Expected HTTP errors are **passing negative scenarios**, not ignored failures.
Status, headers and body are asserted independently, so a response merely arriving
does not pass the test. Compilation errors, assertion failures and request errors
produce a nonzero command exit status with diagnostic output.

The fixture in `tests/fixtures/synthetic-api.ts` belongs only to these tests; its
routes and payloads are not a shared execution contract. Scenarios live in
`tests/smoke.test.ts`. To add a local scenario, add deterministic fixture behavior
and a named `it` assertion there, keeping all requests on the owned loopback API.
`tests/target-safety.test.ts` verifies that other local fixtures, redirect
destinations and unsupported loopback/address forms receive no requests. Do not
introduce a customer or remote target.

## Local k6 performance harness

The separately documented [performance harness](performance/README.md) provides
an owned direct-mock fixture and an isolated Dev profile for the real pinned
Platform application with actual WireMock and its existing mappings. The Dev
profile requires an exact-source prepared image and creates its own temporary
runtime on a random loopback port. Neither profile accepts arbitrary target URLs;
mocked Dev results do not prove UAT or Production capacity.

## Scope and dependency boundary

This repository currently provides TypeScript setup, readable local BDD smoke
checks, request-boundary loopback target safety, meaningful positive/negative
assertions, and setup documentation only.
Ticket status and outstanding work are recorded in
[docs/history/ticket-status.md](docs/history/ticket-status.md).

Shared execution contracts, the dependent execution engine, integrations,
customer execution, credentials, provisioning, cloud setup, paid services and
automatic hosted CI are deliberately excluded. Nothing here freezes or modifies
those future interfaces or advances the Jira ticket.

## Inactive OpenAPI intake preflight

`src/intake/preflight.ts` exports an in-memory preparation function for synthetic
JSON/YAML strings. It is not connected to an upload endpoint, UI, store, runner,
identity service or customer intake. RRDAPI-2/8 execution remains deferred.

The caller must supply every `PreflightPolicy` setting: UTF-8 byte limit, AST depth
and node limits, reference count limit, deadline, worker V8 heap and stack settings,
and an exact OpenAPI version allow-list. Missing/invalid settings fail closed.
Each configuration value is read once into a validated plain snapshot; that same
snapshot controls the byte check, parser transfer, resource flags and deadline.
Inherited/non-enumerable settings are preserved, not silently lost in IPC.
Numbers in the tests are synthetic test configuration, not approved product limits.
The allow-list recognizes 3.0.x/3.1.x version declarations only; it does not promise
schema support. Policy comes from trusted application configuration, never the
uploaded document or a customer-selected bypass.

The pinned `yaml` parser inspects one document's AST without alias expansion or
reference resolution. JSON additionally passes native JSON syntax parsing. The
preflight rejects duplicate keys, multiple documents, explicit YAML tags, anchors,
aliases, merge keys, complex/non-string keys, non-finite numbers, external `$ref`
values, and unsupported URI scope/dynamic/anchor keywords. Local JSON Pointer
references must first satisfy RFC 3986 URI-fragment syntax, then JSON Pointer
escape syntax; target resolution is not performed. The conservative check visits
all mappings, including examples/extensions; it may reject otherwise valid OpenAPI.
Imported strings are data and are never evaluated or used as instructions.

Parsing happens in a short-lived Node **child process**, not a Worker thread:
Worker startup OOM can abort its caller, even with resource limits and error
handlers ([Node documentation](https://nodejs.org/api/worker_threads.html)).
The child receives no inherited environment/preload flags, ignores stdout/stderr,
and communicates only the input and fixed result over IPC. Its exit and IPC closure
are awaited before returning, including timeout/error paths. Fatal parser V8
failures become `worker-failed` without aborting the caller's V8 process.

The existing `workerHeapMb` setting now controls the child's V8 old-space limit;
`workerStackMb` controls its V8 stack size. Conservative technical startup floors
are **32 MiB old space and 4 MiB stack**, tested with the pinned parser on Linux
Node **22.23.4 and 24.22.1**. Smaller settings fail closed before process creation;
settings must also fit V8's signed integer flags (stack converted to KiB). These
floors are implementation constraints, not product defaults or a promise that
every admitted document fits. Other OS/runtime combinations need validation.

Structure limits apply during AST inspection, after parsing; the byte limit applies
before process creation. This is still not a whole-process/host memory sandbox:
V8 limits exclude external/native allocations, and the caller holds and serializes
the input. Host-wide OOM, concurrency, OS crash dumps and other process permissions
are not controlled here. Future intake still needs approved request/concurrency
limits, process resource containment and crash-artifact handling before activation.

Results contain only a fixed status/error code and, where available, a zero-based
UTF-16 source offset. No parser messages, filenames, keys, values, source lines or
reference destinations leave the worker. Success explicitly returns
`schemaValidated: false` and `executionAuthorized: false`; it is not import approval.
No document-directed file reads, network requests or code execution are performed.

Run `npm run typecheck` and `npm test`. The synthetic suite checks policy failures,
UTF-8 boundaries, structural/reference bounds, unsafe YAML, duplicate/malformed
documents, external references, secret-safe diagnostics, worker timeout cleanup,
and zero requests to an owned loopback target. Resource regressions run in an extra
child process so a regression cannot abort the test runner. They verify rejection
below the startup floors, success at the floors, and recovery after parser heap
exhaustion. On Unix, run `ulimit -c 0` before tests to suppress OS core dumps from
the intentional synthetic exhaustion probe. Existing smoke/target-safety tests
continue unchanged. Test files run sequentially so intentional resource-exhaustion
probes do not compete with another suite's fixed deadlines; policy limits are not
increased for the tests.

## Offline OpenAPI 3.0 document-schema validation

`validateDocumentSchema(source, format, policy)` is a separate inactive entry point
in `src/intake/preflight.ts`. It reuses the same preflight, validated policy snapshot,
child-process lifetime and resource bounds. Existing `preflight()` results remain
unchanged and still report `schemaValidated: false`.

The new stage intersects the caller's exact version allow-list with the tested
technical capability **3.0.0, 3.0.1, 3.0.2, 3.0.3 and 3.0.4**. There is no default
version policy. Other versions, including 3.1 even when explicitly allowed by the
caller, return `schema-version-unsupported`. Swagger Parser 13 alone accepts some
invalid 3.1 Schema Objects; this implementation makes no 3.1 validation claim.

The exact-pinned `@apidevtools/openapi-schemas` and `ajv-draft-04` (versions in
`package.json`) validate the original and resolved in-memory document against the maintained OpenAPI 3.0
schema. Original validation checks reference placement before transformation.
Local pointers must traverse exact own properties under RFC 6901, including
escaped tokens and canonical array indices; inherited properties and joined
missing tokens cannot resolve. The exact-pinned `@apidevtools/swagger-parser`
performs dereferencing with the restrictions below. Its minimum supported Node
version, and Node's built-in TypeScript type stripping used by the performance
harness, set the package `engines` floor. External
references are rejected by preflight **before validator invocation**; file/HTTP
resolvers and secondary JSON/YAML/text/binary input parsers are additionally disabled.
Circular references return `circular-reference-unsupported` in this bounded stage, including
otherwise legitimate recursive schemas. Percent-encoded references return
`reference-unsupported` before resolver invocation: the pinned resolver may decode
more than once and select a different target, even when both target names exist.
This conservative technical restriction includes otherwise valid encodings; plain
JSON Pointer escapes (`~0`, `~1`) remain supported. Rejection is not proof that a
document violates OpenAPI. No declared servers are contacted.

Guards on original and resolved component maps enforce the standard's
[component-map naming rule](https://spec.openapis.org/oas/v3.0.3.html#components-object):
the maintained schema otherwise skips some invalidly named entries. This uses the
OpenAPI rule, not a new product/domain schema. The validator is not a proof of full
OpenAPI specification conformance, business correctness or execution readiness.

Success is `status: 'document-schema-passed'`, `documentSchemaValidated: true`, with
`specificationConformanceValidated`, `importApproved` and `executionAuthorized`
all explicitly **false**. Invalid documents return fixed `document-schema-invalid`
diagnostics. A UTF-16 offset is included only when a validator path maps to an
original AST node without crossing a dereferenced mapping; otherwise it is omitted.
Raw error messages, keys, values, pointers and documents are never returned.
The numeric offset can identify a containing object for errors about missing fields;
it is not a fabricated location for an absent field.

Synthetic tests cover every supported technical version, invalid Schema Objects,
caller-policy intersection, unresolved/circular pointers, original-source locations,
secret-safe diagnostics, validator non-invocation for external refs, intercepted
file/HTTP/secondary-parser hooks, process startup failure, deadline and heap-exhaustion
recovery. The same process/host memory and activation limitations described above
still apply. No hashes, normalization, version identity, inventory/diff, storage,
permissions, credentials, UI or live intake are added by this stage.

## Generated API clients (OpenAPI Generator)

Typed TypeScript clients are generated from the OpenAPI contracts in `contracts/` with OpenAPI Generator
(`typescript-fetch`, version pinned in `openapitools.json`, needs Java 11+). Today the only contract is the synthetic
one that describes `tests/fixtures/synthetic-api.ts`; it produces `src/generated/synthetic-api/`.

- `npm run generate` rewrites the committed clients. Never edit generated files.
- `npm run generate:check` fails when committed output differs from a fresh generation; `npm test` runs the same
  check, so CI fails on drift.
- To add a contract, add an entry to `CLIENTS` in `src/codegen/cli.ts`. Private product contracts (for example
  the BuildProveShip central API) are not stored in this public repository; generate their clients in the repository
  that owns them.
- Pass the guarded fetch client (`tests/http-client.ts`) as `fetchApi` so target-safety rules still apply.

## API e2e suite (profiles and case IDs)

`tests/api-e2e.test.ts` runs API journey cases through a generated client. Each case has a stable ID in its title
(`[API-<AREA>-<NNN>]`) and the run writes `.e2e-results/report.json` (profile, case ID, status, duration) for
reporting to Test Management; the ingest adapter is separate work (RRDTM-97).

- Profiles (`src/e2e/profiles.ts`): `local` (the owned loopback fixture, exercised in CI), and `dev`, `uat` and
  `prod-smoke`, whose origins come from `API_E2E_DEV_ORIGIN`, `API_E2E_UAT_ORIGIN` and `API_E2E_PROD_SMOKE_ORIGIN`
  (plain https only). `prod-smoke` allows GET only. The remote profiles are configured but not run in CI.
- `createProfileFetch` (`src/e2e/profile-fetch.ts`) is the `fetchApi` for generated clients: it blocks other origins
  and methods before sending, never follows redirects and times out.
- Product journeys against the BuildProveShip contract live with the product test assets, not in this generic
  framework.

## OpenAPI versions, inventory and diff (in-memory)

`src/versioning/` holds the logic slice of RRDAPI-14. It has no persistence, encryption, tenant authentication or
target access; callers pass an already authenticated `{ tenantId, applicationId }` scope.

- `OpenApiVersionStore.import` validates a document with the offline document-schema validation above, then records an
  immutable version: filename, declared API version, import time, importer, original-content hash, normalized-content
  hash (RFC 8785 canonical JSON) and the parser and normalization versions. Identical normalized content is
  idempotent; changed content creates the next version. Rejections return only a failure code.
- `buildInventory` lists each operation with a stable identity, parameters, request body, response schemas,
  authentication and a source pointer, and reports missing or duplicate operation IDs and unresolved schemas.
- `diffInventories` lists added, removed and changed operations with plain-language reasons; removals and changes are
  treated as breaking and need review.
- Other tenants get `undefined` for versions, inventories and diffs they do not own.

Not covered: encrypted storage, retention and deletion, safe previews, linking affected cases and approvals (those
need the Test Management contracts), and OpenAPI 3.1.

## Customer SDK export (typescript-axios)

`exportSdkBundle` (`src/export/export-sdk.ts`) turns one validated, normalized OpenAPI version into a customer-owned
bundle: generated Axios client (`sdk/`, pinned OpenAPI Generator), starter contract tests for the selected reviewed
cases (`tests/`, `it.todo` placeholders), `.env.example` with empty placeholders, README, `omissions.json`,
a standalone `package.json`/`tsconfig.json` and `manifest.json`.

- Deterministic: the same inputs give identical files and artifact hash; the manifest records spec version and hash,
  case references, generator and Axios versions and the artifact hash.
- Examples and servers are stripped from the document before generation, and the specification is not copied into the
  bundle.
- Unsupported constructs (today: `callbacks`) are listed in `omissions.json`.
- The bundle typechecks on its own (tested). It does not publish anything, activate CI or contact a target.

Not covered: tenant access, download expiry and provenance (AC 6), regeneration diff with preserved extension points
(AC 5; the version diff is in `src/versioning`), lockfiles in the bundle, and real case-to-test generation.

## Run lifecycle building blocks

`src/run-lifecycle/` is the bounded-run library for RRDAPI-3; it is not yet wired to a command-line entrypoint. It provides a retry-key registry (same key and inputs return the same run, changed inputs conflict), a bounded executor (concurrency limit, one time limit, cancellation; in-flight work is reported unresolved, unstarted scenarios `not-run`, finished results kept), distinct exit codes (`pass` 0, `assertion-failure` 1, `not-run` 2, `cancelled` 3, `infrastructure-error`/`timed-out` 4), a retry rule that never repeats an uncertain modifying request unless marked safe, a request-spacing rate limiter, and per-run state and temporary directories. It sends no request itself and enables no CI trigger or evidence upload.

## Licence

Apache-2.0. See [LICENSE](LICENSE).
