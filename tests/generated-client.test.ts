// Test classification: integration
// Review status: Not Reviewed
// Evidence: synthetic
// Scope: the pinned OpenAPI Generator run (real CLI, synthetic contract) is reproducible and committed output has not drifted; the generated client reaches the owned loopback API through the guarded fetch client; no remote or customer target.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { startSyntheticApi } from "./fixtures/synthetic-api.js";
import type { SyntheticApi } from "./fixtures/synthetic-api.js";
import { createLocalHttpClient } from "./http-client.js";
import {
  Configuration,
  DefaultApi,
  ResponseError,
} from "../src/generated/synthetic-api/index.js";

const root = join(import.meta.dirname, "..", "..");
const cli = join(root, "src", "codegen", "cli.ts");

describe("Given the pinned OpenAPI Generator and the synthetic contract", () => {
  it("When the generator version is read, then it is an exact version, not a range", () => {
    const config = JSON.parse(
      readFileSync(join(root, "openapitools.json"), "utf8"),
    ) as { "generator-cli": { version: string } };

    assert.match(config["generator-cli"].version, /^\d+\.\d+\.\d+$/);
  });

  it("When generate:check runs, then the committed client matches a fresh generation", () => {
    const output = execFileSync(process.execPath, [cli, "check"], {
      cwd: root,
      encoding: "utf8",
    });

    assert.match(output, /up to date/);
  });

  it("When the committed client is edited by hand, then generate:check fails and names the drift", () => {
    const scratch = mkdtempSync(join(tmpdir(), "uaf-drift-"));
    try {
      execFileSync(process.execPath, [cli, "generate", "--out", scratch], {
        cwd: root,
      });
      execFileSync("sh", [
        "-c",
        `echo '// hand edit' >> '${scratch}/runtime.ts'`,
      ]);

      assert.throws(
        () =>
          execFileSync(process.execPath, [cli, "check", "--against", scratch], {
            cwd: root,
            stdio: "pipe",
          }),
        (error: { stderr: Buffer }) => /drift/i.test(error.stderr.toString()),
      );
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});

describe(
  "Given the generated client and an owned local synthetic API",
  { timeout: 15_000 },
  () => {
    let api: SyntheticApi | undefined;
    let client: DefaultApi;

    before(async () => {
      api = await startSyntheticApi();
      const guarded = createLocalHttpClient(api.origin);
      client = new DefaultApi(
        new Configuration({
          basePath: api.origin,
          fetchApi: (input: string, init?: RequestInit) =>
            guarded.request(input, init),
        }),
      );
    });

    after(async () => {
      await api?.close();
    });

    it("When getHealth is called, then the typed response matches the contract", async () => {
      assert.deepEqual(await client.getHealth(), {
        status: "ok",
        source: "local-synthetic-api",
      });
    });

    it("When getWidget is called for a known id, then the typed widget is returned", async () => {
      assert.deepEqual(await client.getWidget({ widgetId: "widget-1" }), {
        id: "widget-1",
        name: "Synthetic widget",
        active: true,
      });
    });

    it("When getWidget is called for an unknown id, then a ResponseError carries the 404", async () => {
      await assert.rejects(
        client.getWidget({ widgetId: "missing" }),
        (error: unknown) =>
          error instanceof ResponseError && error.response.status === 404,
      );
    });
  },
);
