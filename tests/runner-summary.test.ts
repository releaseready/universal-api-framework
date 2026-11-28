// Test classification: unit
// Review status: Not Reviewed
// Evidence: synthetic
// Scope: the runner's test-event collector, summary.json shape and exit-code mapping; no process is spawned and no network is used.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  exitCodeFor,
  SummaryCollector,
  buildSummary,
  type TestEvent,
} from "../src/runner/summary.js";

describe("Given the runner summary", () => {
  it("When leaf tests pass, fail and skip, then only leaf tests are counted", () => {
    const collector = new SummaryCollector();
    collector.record({
      type: "test:pass",
      data: { details: { type: "suite" } },
    });
    collector.record({ type: "test:pass", data: { details: {} } });
    collector.record({ type: "test:fail", data: { details: {} } });
    // A skipped test arrives as a pass event whose data names the skip reason.
    collector.record(
      JSON.parse(
        '{"type":"test:pass","data":{"skip":"not run","details":{}}}',
      ) as TestEvent,
    );
    collector.record({ type: "test:diagnostic", data: {} });

    assert.deepEqual(collector.totals(), {
      total: 3,
      passed: 1,
      failed: 1,
      skipped: 1,
    });
  });

  it("When the summary is built, then it holds the run id, the target origin only, totals and the exit code", () => {
    const summary = buildSummary({
      runId: "run-1",
      target: new URL("https://example.test/secret/path?token=abc"),
      suite: "dist/tests/*.test.js",
      totals: { total: 2, passed: 2, failed: 0, skipped: 0 },
      durationMs: 1234,
    });

    assert.deepEqual(summary, {
      runId: "run-1",
      target: "https://example.test",
      suite: "dist/tests/*.test.js",
      totals: { total: 2, passed: 2, failed: 0, skipped: 0 },
      durationMs: 1234,
      exitCode: 0,
    });
    assert.doesNotMatch(JSON.stringify(summary), /token|secret/);
  });

  it("When the outcome is mapped to an exit code, then 0 is a pass, 1 a failure and 2 a config error", () => {
    assert.equal(
      exitCodeFor({ total: 1, passed: 1, failed: 0, skipped: 0 }),
      0,
    );
    assert.equal(
      exitCodeFor({ total: 1, passed: 0, failed: 1, skipped: 0 }),
      1,
    );
    assert.equal(
      exitCodeFor({ total: 0, passed: 0, failed: 0, skipped: 0 }),
      1,
    );
    assert.equal(exitCodeFor("config-error"), 2);
  });
});
