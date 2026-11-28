// Test classification: integration
// Review status: Not Reviewed
// Evidence: synthetic
// Scope: the pinned OpenAPI Generator (real CLI, typescript-axios) exports a customer SDK bundle from a synthetic normalized document; the bundle is checked for determinism, manifest content, secret-free output, omissions and an independent typecheck; no publication, tenant access control or target request.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join, relative } from "node:path";
import { after, before, describe, it } from "node:test";
import { exportSdkBundle } from "../src/export/export-sdk.js";
import type { ExportRequest } from "../src/export/export-sdk.js";
import { normalizeDocument, sha256 } from "../src/versioning/hash.js";

const root = join(import.meta.dirname, "..", "..");
const scratchRoot = join(root, ".sdk-export-tmp");
const SECRET = "sk_live_SYNTHETIC_SECRET_VALUE";

const document = (extra: Record<string, unknown> = {}): string =>
  normalizeDocument(
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Synthetic", version: "1.2.3" },
      servers: [{ url: `https://user:${SECRET}@api.example.test` }],
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
                    example: { id: SECRET, name: "x" },
                  },
                },
              },
            },
          },
        },
        ...extra,
      },
      components: {
        schemas: {
          Widget: {
            type: "object",
            required: ["id"],
            properties: {
              id: { type: "string", example: SECRET },
              name: { type: "string" },
            },
          },
        },
      },
    }),
  );

const request = (outDir: string, source = document()): ExportRequest => ({
  specSource: source,
  specHash: sha256(source),
  specVersion: "1.2.3",
  cases: [{ caseId: "API-WIDGET-001", revision: 3 }],
  outDir,
});

function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)))
    .sort();
}

describe(
  "Given an SDK export of a synthetic document",
  { timeout: 120_000 },
  () => {
    before(() => {
      mkdirSync(scratchRoot, { recursive: true });
    });
    after(() => {
      rmSync(scratchRoot, { recursive: true, force: true });
    });
    const fresh = (): string => mkdtempSync(join(scratchRoot, "bundle-"));

    it("When exported, then the bundle has a typed client, case starter tests, config template, README, omissions report and manifest", () => {
      const out = fresh();
      exportSdkBundle(request(out));
      const files = listFiles(out);

      for (const expected of [
        "manifest.json",
        "README.md",
        ".env.example",
        "omissions.json",
        "package.json",
        "tsconfig.json",
        "sdk/index.ts",
        "sdk/api/default-api.ts",
        "tests/contract.test.ts",
      ]) {
        assert.ok(files.includes(expected), `missing ${expected}`);
      }
      assert.match(
        readFileSync(join(out, "tests", "contract.test.ts"), "utf8"),
        /API-WIDGET-001/,
      );
    });

    it("When exported twice from the same inputs, then every file and the artifact hash are identical", () => {
      const a = fresh();
      const b = fresh();
      const first = exportSdkBundle(request(a));
      const second = exportSdkBundle(request(b));

      assert.equal(first.artifactHash, second.artifactHash);
      assert.deepEqual(listFiles(a), listFiles(b));
      for (const file of listFiles(a)) {
        assert.equal(
          readFileSync(join(a, file), "utf8"),
          readFileSync(join(b, file), "utf8"),
          file,
        );
      }
    });

    it("When the manifest is read, then it records spec version and hash, case references, generator and runtime versions and the artifact hash", () => {
      const out = fresh();
      const result = exportSdkBundle(request(out));
      const manifest = JSON.parse(
        readFileSync(join(out, "manifest.json"), "utf8"),
      ) as Record<string, unknown>;

      assert.deepEqual(manifest, {
        specVersion: "1.2.3",
        specHash: sha256(document()),
        cases: [{ caseId: "API-WIDGET-001", revision: 3 }],
        generator: { name: "typescript-axios", version: "7.28.0" },
        runtime: {
          axios:
            manifest.runtime &&
            (manifest.runtime as Record<string, string>).axios,
        },
        artifactHash: result.artifactHash,
      });
      assert.match(
        (manifest.runtime as Record<string, string>).axios ?? "",
        /^\d+\.\d+\.\d+$/,
      );
    });

    it("When every file is inspected, then it holds no secret, no example value, no spec copy and no non-placeholder config", () => {
      const out = fresh();
      exportSdkBundle(request(out));

      for (const file of listFiles(out)) {
        const text = readFileSync(join(out, file), "utf8");
        assert.ok(!text.includes(SECRET), `${file} leaks a secret`);
        assert.ok(
          !text.includes(document()),
          `${file} copies the specification`,
        );
      }
      assert.match(
        readFileSync(join(out, ".env.example"), "utf8"),
        /^API_BASE_URL=\nAPI_TOKEN=\n/,
      );
    });

    it("When the document uses a construct the generator ignores, then the omissions report names it", () => {
      const out = fresh();
      const source = document({
        "/hook": {
          post: {
            operationId: "registerHook",
            responses: { "200": { description: "ok" } },
            callbacks: {
              onEvent: {
                "{$request.body#/url}": {
                  post: { responses: { "200": { description: "ok" } } },
                },
              },
            },
          },
        },
      });
      exportSdkBundle(request(out, source));
      const omissions = JSON.parse(
        readFileSync(join(out, "omissions.json"), "utf8"),
      ) as { construct: string; operationId: string }[];

      assert.deepEqual(omissions, [
        { construct: "callbacks", operationId: "registerHook" },
      ]);
    });

    it("When the bundle is built on its own, then the SDK typechecks without the API test engine", () => {
      const out = fresh();
      exportSdkBundle(request(out));

      execFileSync(
        join(root, "node_modules", ".bin", "tsc"),
        ["--noEmit", "-p", join(out, "tsconfig.json")],
        {
          cwd: out,
          stdio: "pipe",
        },
      );
    });
  },
);
