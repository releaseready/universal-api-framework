// Test classification: integration
// Review status: Not Reviewed
// Evidence: synthetic
// Scope: the runner entrypoint resolves its target, runs an injected suite, writes summary.json under RR_OUT_DIR/RR_RUN_ID and returns the documented exit code, and never logs RR_ tokens; it spawns no process and makes no network request.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { runRunner } from "../src/runner/cli.js";

describe("Given the runner entrypoint", () => {
  let out = "";
  before(() => {
    out = mkdtempSync(join(tmpdir(), "rr-runner-"));
  });
  after(() => {
    rmSync(out, { recursive: true, force: true });
  });

  const passing = () =>
    Promise.resolve({ total: 1, passed: 1, failed: 0, skipped: 0 });

  it("When the suite passes, then it exits 0 and writes summary.json to the run folder", async () => {
    const lines: string[] = [];
    const code = await runRunner(
      {
        RR_BASE_URL: "http://127.0.0.1:8080",
        RR_RUN_ID: "run-pass",
        RR_OUT_DIR: out,
        RR_SUITE: "dist/tests/smoke.test.js",
      },
      { runSuite: passing, log: (line) => lines.push(line) },
    );

    assert.equal(code, 0);
    const summary = JSON.parse(
      readFileSync(join(out, "run-pass", "summary.json"), "utf8"),
    ) as { runId: string; suite: string; exitCode: number };
    assert.equal(summary.runId, "run-pass");
    assert.equal(summary.suite, "dist/tests/smoke.test.js");
    assert.equal(summary.exitCode, 0);
  });

  it("When RR_SUITE is not set, then the smoke suite is the default", async () => {
    let suite = "";
    await runRunner(
      {
        RR_BASE_URL: "http://127.0.0.1:8080",
        RR_RUN_ID: "run-default",
        RR_OUT_DIR: out,
      },
      {
        runSuite: (requested) => {
          suite = requested;
          return passing();
        },
        log: () => undefined,
      },
    );

    assert.equal(suite, "dist/tests/smoke.test.js");
  });

  it("When the suite has a failure, then it exits 1", async () => {
    const code = await runRunner(
      {
        RR_BASE_URL: "http://127.0.0.1:8080",
        RR_RUN_ID: "run-fail",
        RR_OUT_DIR: out,
      },
      {
        runSuite: () =>
          Promise.resolve({ total: 2, passed: 1, failed: 1, skipped: 0 }),
        log: () => undefined,
      },
    );

    assert.equal(code, 1);
  });

  it("When the target is refused, then it exits 2 without running the suite and writes no summary", async () => {
    let ran = false;
    const code = await runRunner(
      {
        RR_BASE_URL: "https://example.test",
        RR_RUN_ID: "run-refused",
        RR_OUT_DIR: out,
      },
      {
        runSuite: () => {
          ran = true;
          return passing();
        },
        log: () => undefined,
      },
    );

    assert.equal(code, 2);
    assert.equal(ran, false);
    assert.throws(() =>
      readFileSync(join(out, "run-refused", "summary.json"), "utf8"),
    );
  });

  it("When RR_ values are set, then no token-like value is logged", async () => {
    const lines: string[] = [];
    await runRunner(
      {
        RR_BASE_URL: "http://127.0.0.1:8080",
        RR_RUN_ID: "run-log",
        RR_OUT_DIR: out,
        RR_API_TOKEN: "super-secret-token",
      },
      { runSuite: passing, log: (line) => lines.push(line) },
    );

    assert.doesNotMatch(lines.join("\n"), /super-secret-token/);
  });

  it("When RR_RUN_ID is not set, then a UUID is generated", async () => {
    const lines: string[] = [];
    await runRunner(
      { RR_BASE_URL: "http://127.0.0.1:8080", RR_OUT_DIR: out },
      { runSuite: passing, log: (line) => lines.push(line) },
    );

    assert.match(
      lines.join("\n"),
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
    );
  });
});
