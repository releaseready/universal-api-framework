// Test classification: integration
// Review status: Not Reviewed
// Evidence: synthetic
// Scope: in-memory OpenAPI version store, content hashes, operation inventory and version diff composed with the existing offline document-schema validation; no persistence, tenant authentication, encryption or target access.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildInventory } from "../src/versioning/inventory.js";
import { diffInventories } from "../src/versioning/diff.js";
import { normalizeDocument, sha256 } from "../src/versioning/hash.js";
import { OpenApiVersionStore } from "../src/versioning/version-store.js";
import type { PreflightPolicy } from "../src/intake/preflight.js";

const policy: PreflightPolicy = {
  maxBytes: 65_536,
  maxDepth: 30,
  maxNodes: 2_000,
  maxReferences: 20,
  timeoutMs: 10_000,
  workerHeapMb: 64,
  workerStackMb: 4,
  allowedOpenApiVersions: ["3.0.3"],
};

interface Spec {
  paths: Record<string, unknown>;
  components?: Record<string, unknown>;
  security?: unknown[];
}
const spec = (overrides: Partial<Spec> = {}): string =>
  JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Synthetic", version: "1.0.0" },
    paths: {
      "/widgets/{id}": {
        get: {
          operationId: "getWidget",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "ok",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Widget" },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Widget: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
      },
    },
    ...overrides,
  });
const parse = (source: string): Record<string, unknown> =>
  JSON.parse(source) as Record<string, unknown>;
const scopeA = { tenantId: "tenant-a", applicationId: "app-1" };
const scopeB = { tenantId: "tenant-b", applicationId: "app-1" };
function only<T>(items: readonly T[]): T {
  const [item] = items;
  assert.ok(item);
  return item;
}
const meta = {
  filename: "api.json",
  importer: "importer-1",
  format: "json" as const,
};

describe("Given content hashing", () => {
  it("When the same document is written with another key order, then the normalized hash is identical but the original hash differs", () => {
    const reordered = JSON.stringify(
      Object.fromEntries(Object.entries(parse(spec())).reverse()),
    );
    const a = normalizeDocument(spec());
    const b = normalizeDocument(reordered);

    assert.equal(sha256(a), sha256(b));
    assert.notEqual(sha256(spec()), sha256(reordered));
  });

  it("When a response type changes, then the normalized hash changes", () => {
    const changed = spec({
      components: {
        schemas: {
          Widget: { type: "object", properties: { id: { type: "integer" } } },
        },
      },
    });

    assert.notEqual(
      sha256(normalizeDocument(spec())),
      sha256(normalizeDocument(changed)),
    );
  });
});

describe("Given an operation inventory", () => {
  it("When built, then each operation has method, path, stable identity, parameters, responses and a source pointer", () => {
    const { operations, problems } = buildInventory(parse(spec()));

    assert.deepEqual(problems, []);
    assert.equal(operations.length, 1);
    const op = only(operations);
    assert.equal(op.id, "getWidget");
    assert.equal(op.method, "GET");
    assert.equal(op.path, "/widgets/{id}");
    assert.equal(op.pointer, "#/paths/~1widgets~1{id}/get");
    assert.deepEqual(op.parameters, [
      { name: "id", in: "path", required: true },
    ]);
    assert.deepEqual(Object.keys(op.responses), ["200"]);
  });

  it("When operation IDs are missing or duplicated, then the problems are visible and identities stay unique", () => {
    const doc = parse(
      spec({
        paths: {
          "/a": { get: { responses: { "200": { description: "ok" } } } },
          "/b": {
            get: {
              operationId: "dup",
              responses: { "200": { description: "ok" } },
            },
            post: {
              operationId: "dup",
              responses: { "200": { description: "ok" } },
            },
          },
        },
      }),
    );
    const { operations, problems } = buildInventory(doc);

    assert.deepEqual(problems.map((p) => p.code).sort(), [
      "duplicate-operation-id",
      "duplicate-operation-id",
      "missing-operation-id",
    ]);
    assert.equal(new Set(operations.map((o) => o.id)).size, operations.length);
    assert.ok(operations.some((o) => o.id === "GET /a"));
  });

  it("When a reference does not resolve, then it is reported as an unresolved schema with its source pointer", () => {
    const doc = parse(
      spec({
        paths: {
          "/a": {
            get: {
              operationId: "a",
              responses: {
                "200": {
                  description: "ok",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/Missing" },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    );

    assert.deepEqual(
      buildInventory(doc).problems.map((p) => p.code),
      ["unresolved-schema"],
    );
  });

  it("When security applies, then operations list the schemes they require", () => {
    const doc = parse(spec({ security: [{ bearer: [] }] }));

    assert.deepEqual(buildInventory(doc).operations[0]?.security, ["bearer"]);
  });
});

describe("Given two inventories", () => {
  const before = buildInventory(parse(spec())).operations;

  it("When a required request field is added to a referenced response schema, then the operation is changed and breaking with a readable reason", () => {
    const next = buildInventory(
      parse(
        spec({
          components: {
            schemas: {
              Widget: {
                type: "object",
                required: ["id", "name"],
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                },
              },
            },
          },
        }),
      ),
    ).operations;
    const diff = diffInventories(before, next);

    assert.deepEqual(diff.added, []);
    assert.deepEqual(diff.removed, []);
    assert.equal(only(diff.changed).id, "getWidget");
    assert.equal(only(diff.changed).breaking, true);
    assert.match(
      only(diff.changed).reasons.join(" "),
      /response 200 schema changed/,
    );
  });

  it("When an endpoint is removed or added, then it is listed, and a removal is breaking", () => {
    const diff = diffInventories(before, []);
    assert.deepEqual(diff.removed, ["getWidget"]);
    assert.equal(diff.breaking, true);

    const grown = diffInventories([], before);
    assert.deepEqual(grown.added, ["getWidget"]);
    assert.equal(grown.breaking, false);
  });

  it("When a new required parameter appears, then the change names it", () => {
    const next = buildInventory(
      parse(
        spec({
          paths: {
            "/widgets/{id}": {
              get: {
                operationId: "getWidget",
                parameters: [
                  {
                    name: "id",
                    in: "path",
                    required: true,
                    schema: { type: "string" },
                  },
                  {
                    name: "tenant",
                    in: "header",
                    required: true,
                    schema: { type: "string" },
                  },
                ],
                responses: {
                  "200": {
                    description: "ok",
                    content: {
                      "application/json": {
                        schema: { $ref: "#/components/schemas/Widget" },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      ),
    ).operations;

    assert.match(
      diffInventories(before, next).changed[0]?.reasons.join(" ") ?? "",
      /new required parameter tenant \(header\)/,
    );
  });

  it("When nothing changed, then the diff is empty", () => {
    assert.deepEqual(diffInventories(before, before), {
      added: [],
      removed: [],
      changed: [],
      breaking: false,
    });
  });
});

describe("Given the in-memory version store", () => {
  it("When a valid document is imported, then an immutable version records filename, declared version, time, importer, both hashes and the parser and normalization versions", async () => {
    const store = new OpenApiVersionStore(policy);
    const now = new Date("2026-11-28T00:00:00Z");
    const result = await store.import(scopeA, { ...meta, source: spec(), now });

    assert.equal(result.status, "created");
    const v = result.version;
    assert.equal(v.versionNumber, 1);
    assert.equal(v.filename, "api.json");
    assert.equal(v.declaredApiVersion, "1.0.0");
    assert.equal(v.importedAt, now.toISOString());
    assert.equal(v.importer, "importer-1");
    assert.equal(v.originalHash, sha256(spec()));
    assert.match(v.normalizedHash, /^[0-9a-f]{64}$/);
    assert.match(v.parserVersion, /^swagger-parser@\d+\.\d+\.\d+/);
    assert.equal(v.normalizationVersion, "1");
    assert.ok(Object.isFrozen(v));
  });

  it("When identical content is imported again, then no new version is created", async () => {
    const store = new OpenApiVersionStore(policy);
    await store.import(scopeA, {
      ...meta,
      source: spec(),
      now: new Date(),
    });
    const again = await store.import(scopeA, {
      ...meta,
      filename: "renamed.json",
      source: JSON.stringify(
        Object.fromEntries(Object.entries(parse(spec())).reverse()),
      ),
      now: new Date(),
    });

    assert.equal(again.status, "unchanged");
    assert.equal(store.list(scopeA).length, 1);
    assert.equal(again.version.versionNumber, 1);
  });

  it("When changed content is imported, then a new version is created, earlier versions are unchanged and the diff lists the affected operations", async () => {
    const store = new OpenApiVersionStore(policy);
    await store.import(scopeA, { ...meta, source: spec(), now: new Date() });
    const before = store.list(scopeA)[0];
    const changed = spec({
      paths: {
        "/widgets/{id}": {
          get: {
            operationId: "getWidget",
            parameters: [
              {
                name: "id",
                in: "path",
                required: true,
                schema: { type: "string" },
              },
            ],
            responses: { "200": { description: "ok" } },
          },
        },
      },
    });
    const second = await store.import(scopeA, {
      ...meta,
      source: changed,
      now: new Date(),
    });

    assert.equal(second.status, "created");
    assert.equal(store.list(scopeA).length, 2);
    assert.deepEqual(store.list(scopeA)[0], before);
    const diff = store.diff(scopeA, 1, 2);
    assert.equal(diff?.changed[0]?.id, "getWidget");
  });

  it("When another tenant asks for a version, inventory or diff, then it gets nothing and learns nothing", async () => {
    const store = new OpenApiVersionStore(policy);
    await store.import(scopeA, { ...meta, source: spec(), now: new Date() });

    assert.deepEqual(store.list(scopeB), []);
    assert.equal(store.get(scopeB, 1), undefined);
    assert.equal(store.inventory(scopeB, 1), undefined);
    assert.equal(store.diff(scopeB, 1, 1), undefined);
  });

  it("When the document is rejected, then the result carries only a failure code and no document text", async () => {
    const store = new OpenApiVersionStore(policy);
    const secret = "sk_live_SYNTHETIC_SECRET_VALUE";
    const result = await store.import(scopeA, {
      ...meta,
      source: `{"openapi":"3.0.3","info":{"title":"${secret}"},`,
      now: new Date(),
    });

    assert.equal(result.status, "rejected");
    assert.ok(!JSON.stringify(result).includes(secret));
    assert.equal(store.list(scopeA).length, 0);
  });

  it("When an unsupported OpenAPI version is imported, then it is rejected, not accepted silently", async () => {
    const store = new OpenApiVersionStore(policy);
    const result = await store.import(scopeA, {
      ...meta,
      source: spec().replace("3.0.3", "3.0.4"),
      now: new Date(),
    });

    assert.equal(result.status, "rejected");
  });
});
