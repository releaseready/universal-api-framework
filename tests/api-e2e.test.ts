// Test classification: e2e
// Review status: Not Reviewed
// Evidence: synthetic
// Scope: API journey cases with stable case IDs run through the generated client and the profile fetch guard against the owned synthetic loopback API (local profile); Dev, UAT and prod-smoke profiles are configured but not exercised here.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { startSyntheticApi } from "./fixtures/synthetic-api.js";
import type { SyntheticApi } from "./fixtures/synthetic-api.js";
import {
  Configuration,
  DefaultApi,
} from "../src/generated/synthetic-api/index.js";
import { createProfileFetch } from "../src/e2e/profile-fetch.js";
import { CaseReport } from "../src/e2e/case-report.js";
import { defineCase } from "../src/e2e/define-case.js";

const resultsDir = join(import.meta.dirname, "..", "..", ".e2e-results");

describe(
  "Given the local profile on the owned synthetic API",
  { timeout: 15_000 },
  () => {
    let api: SyntheticApi | undefined;
    let client: DefaultApi;
    const report = new CaseReport("local");
    const apiCase = defineCase(report);

    before(async () => {
      api = await startSyntheticApi();
      client = new DefaultApi(
        new Configuration({
          basePath: api.origin,
          fetchApi: createProfileFetch({
            name: "local",
            origin: api.origin,
            allowedMethods: ["GET"],
          }),
        }),
      );
    });

    after(async () => {
      await api?.close();
      mkdirSync(resultsDir, { recursive: true });
      writeFileSync(
        join(resultsDir, "report.json"),
        JSON.stringify(report.toJSON(), null, 2),
      );
    });

    apiCase("API-HEALTH-001", "the service reports healthy", async () => {
      assert.equal((await client.getHealth()).status, "ok");
    });

    apiCase("API-WIDGET-001", "a known widget can be read", async () => {
      assert.equal(
        (await client.getWidget({ widgetId: "widget-1" })).active,
        true,
      );
    });

    it("When the suite has finished, then every case wrote a report entry with its stable ID", () => {
      assert.deepEqual(
        report.toJSON().results.map((r) => [r.caseId, r.status]),
        [
          ["API-HEALTH-001", "passed"],
          ["API-WIDGET-001", "passed"],
        ],
      );
    });
  },
);
