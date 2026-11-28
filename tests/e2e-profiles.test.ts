// Test classification: unit
// Review status: Not Reviewed
// Evidence: synthetic
// Scope: profile resolution, the approved-origin/method fetch guard and the case-ID report collector in src/e2e; no network beyond an owned loopback fixture.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startSyntheticApi } from "./fixtures/synthetic-api.js";
import type { SyntheticApi } from "./fixtures/synthetic-api.js";
import { createProfileFetch } from "../src/e2e/profile-fetch.js";
import { resolveProfile } from "../src/e2e/profiles.js";
import { CaseReport } from "../src/e2e/case-report.js";

describe("Given the e2e profiles", () => {
  it("When dev is resolved with its origin set, then it allows reads and writes on exactly that https origin", () => {
    const profile = resolveProfile("dev", {
      API_E2E_DEV_ORIGIN: "https://dev.example.test",
    });

    assert.equal(profile.origin, "https://dev.example.test");
    assert.deepEqual([...profile.allowedMethods].sort(), [
      "DELETE",
      "GET",
      "PATCH",
      "POST",
      "PUT",
    ]);
  });

  it("When prod-smoke is resolved, then only GET is allowed", () => {
    const profile = resolveProfile("prod-smoke", {
      API_E2E_PROD_SMOKE_ORIGIN: "https://prod.example.test",
    });

    assert.deepEqual([...profile.allowedMethods], ["GET"]);
  });

  it("When a remote profile has no origin configured, then it fails and names the variable", () => {
    assert.throws(() => resolveProfile("uat", {}), /API_E2E_UAT_ORIGIN/);
  });

  it("When a remote origin is not plain https, then it is rejected", () => {
    for (const origin of [
      "http://dev.example.test",
      "https://user:pw@dev.example.test",
      "https://dev.example.test/path",
      "not a url",
    ]) {
      assert.throws(
        () => resolveProfile("dev", { API_E2E_DEV_ORIGIN: origin }),
        /origin/i,
        origin,
      );
    }
  });

  it("When an unknown profile is requested, then it is rejected", () => {
    assert.throws(() => resolveProfile("staging", {}), /Unknown e2e profile/);
  });
});

describe("Given a profile fetch guard on an owned loopback API", () => {
  let api: SyntheticApi;
  let other: SyntheticApi;

  before(async () => {
    api = await startSyntheticApi();
    other = await startSyntheticApi();
  });
  after(async () => {
    await api.close();
    await other.close();
  });

  const profileFor = (origin: string, methods: readonly string[]) => ({
    name: "local" as const,
    origin,
    allowedMethods: methods,
  });

  it("When an allowed method targets the approved origin, then the request goes through", async () => {
    const guarded = createProfileFetch(profileFor(api.origin, ["GET"]));

    assert.equal((await guarded(`${api.origin}/health`)).status, 200);
  });

  it("When the method is not allowed, then it is blocked before any request is sent", async () => {
    const before = api.requestCount;
    const guarded = createProfileFetch(profileFor(api.origin, ["GET"]));

    await assert.rejects(
      guarded(`${api.origin}/health`, { method: "POST" }),
      /method/i,
    );
    assert.equal(api.requestCount, before);
  });

  it("When the destination is another origin, then it is blocked and receives nothing", async () => {
    const before = other.requestCount;
    const guarded = createProfileFetch(profileFor(api.origin, ["GET"]));

    await assert.rejects(guarded(`${other.origin}/health`), /origin/i);
    assert.equal(other.requestCount, before);
  });

  it("When the API redirects, then the redirect is not followed", async () => {
    const redirecting = await startSyntheticApi({
      redirectTarget: `${other.origin}/health`,
    });
    const before = other.requestCount;
    try {
      const guarded = createProfileFetch(
        profileFor(redirecting.origin, ["GET"]),
      );
      await assert.rejects(guarded(`${redirecting.origin}/redirect`));
      assert.equal(other.requestCount, before);
    } finally {
      await redirecting.close();
    }
  });
});

describe("Given a case report", () => {
  it("When results are recorded, then the report lists each stable case ID with its status", () => {
    const report = new CaseReport("local");
    report.record("API-HEALTH-001", "passed", 12);
    report.record("API-WIDGET-001", "failed", 7, "expected 200");

    assert.deepEqual(report.toJSON(), {
      profile: "local",
      results: [
        { caseId: "API-HEALTH-001", status: "passed", durationMs: 12 },
        {
          caseId: "API-WIDGET-001",
          status: "failed",
          durationMs: 7,
          message: "expected 200",
        },
      ],
    });
  });

  it("When a case ID is malformed or recorded twice, then it is rejected", () => {
    const report = new CaseReport("local");
    report.record("API-HEALTH-001", "passed", 1);

    assert.throws(() => {
      report.record("health-1", "passed", 1);
    }, /case ID/i);
    assert.throws(() => {
      report.record("API-HEALTH-001", "passed", 1);
    }, /already/i);
  });
});
