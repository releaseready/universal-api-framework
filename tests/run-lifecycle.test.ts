// Test classification: component
// Review status: Not Reviewed
// Evidence: synthetic
// Scope: run registry, bounded executor, retry rule and exit codes with in-process scenarios; it does not call a real target.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createRunContext,
  createRunRegistry,
  decideRetry,
  executeRun,
  exitCodeFor,
  type Scenario,
} from "../src/run-lifecycle/index.js";

const pass = (id: string): Scenario => ({
  id,
  run: () => Promise.resolve("pass"),
});
const never = (id: string): Scenario => ({
  id,
  run: () => new Promise(() => undefined),
});

describe("Given a run registry keyed by retry key", () => {
  it("When the same key and inputs are submitted again, then the same logical run is returned and it is not started twice", () => {
    const registry = createRunRegistry();

    const first = registry.submit({ retryKey: "k1", inputsHash: "h1" });
    const again = registry.submit({ retryKey: "k1", inputsHash: "h1" });

    assert.equal(first.status, "accepted");
    assert.equal(again.status, "duplicate");
    assert.equal(again.runId, first.runId);
  });

  it("When the key is reused with changed inputs, then the conflict is rejected and no run starts", () => {
    const registry = createRunRegistry();
    registry.submit({ retryKey: "k1", inputsHash: "h1" });

    const conflict = registry.submit({ retryKey: "k1", inputsHash: "h2" });

    assert.deepEqual(conflict, { status: "conflict" });
    assert.equal(registry.size, 1);
  });

  it("When different keys are submitted, then each gets its own stable run reference", () => {
    const registry = createRunRegistry();

    const a = registry.submit({ retryKey: "a", inputsHash: "h" });
    const b = registry.submit({ retryKey: "b", inputsHash: "h" });

    assert.ok(a.status === "accepted" && b.status === "accepted");
    assert.notEqual(a.runId, b.runId);
  });
});

describe("Given scenarios within limits", () => {
  it("When they pass, then results and the exit code are pass", async () => {
    const result = await executeRun([pass("a"), pass("b")], {
      timeoutMs: 1_000,
      maxConcurrency: 2,
    });

    assert.equal(result.outcome, "pass");
    assert.deepEqual(
      result.results.map((r) => r.status),
      ["pass", "pass"],
    );
    assert.equal(exitCodeFor(result.outcome), 0);
  });

  it("When one scenario fails an assertion, then the outcome is assertion-failure with a distinct exit code", async () => {
    const fail: Scenario = { id: "f", run: () => Promise.resolve("fail") };

    const result = await executeRun([pass("a"), fail], {
      timeoutMs: 1_000,
      maxConcurrency: 1,
    });

    assert.equal(result.outcome, "assertion-failure");
    assert.equal(exitCodeFor("assertion-failure"), 1);
  });

  it("When a scenario throws, then it is an infrastructure error and the others still report", async () => {
    const boom: Scenario = {
      id: "b",
      run: () => Promise.reject(new Error("socket")),
    };

    const result = await executeRun([boom, pass("a")], {
      timeoutMs: 1_000,
      maxConcurrency: 1,
    });

    assert.equal(result.outcome, "infrastructure-error");
    assert.deepEqual(
      result.results.map((r) => r.status),
      ["error", "pass"],
    );
  });

  it("When nothing is selected, then it is not-run rather than passed", async () => {
    const result = await executeRun([], {
      timeoutMs: 1_000,
      maxConcurrency: 1,
    });

    assert.equal(result.outcome, "not-run");
    assert.equal(exitCodeFor("not-run"), 2);
  });

  it("When scenarios run, then no more than maxConcurrency run at once", async () => {
    let active = 0;
    let peak = 0;
    const slow = (id: string): Scenario => ({
      id,
      run: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return "pass";
      },
    });

    await executeRun(["a", "b", "c", "d", "e"].map(slow), {
      timeoutMs: 1_000,
      maxConcurrency: 2,
    });

    assert.equal(peak, 2);
  });
});

describe("Given a run that exceeds its time limit or is cancelled", () => {
  it("When the time limit passes, then in-flight work is reported unresolved, remaining scenarios do not start, and completed results are kept", async () => {
    const started: string[] = [];
    const tracked = (s: Scenario): Scenario => ({
      id: s.id,
      run: (ctx) => {
        started.push(s.id);
        return s.run(ctx);
      },
    });

    const result = await executeRun(
      [tracked(pass("a")), tracked(never("b")), tracked(pass("c"))],
      {
        timeoutMs: 30,
        maxConcurrency: 1,
      },
    );

    assert.equal(result.outcome, "timed-out");
    assert.deepEqual(
      result.results.map((r) => [r.id, r.status]),
      [
        ["a", "pass"],
        ["b", "unresolved"],
        ["c", "not-run"],
      ],
    );
    assert.deepEqual(started, ["a", "b"]);
    assert.equal(exitCodeFor("timed-out"), 4);
  });

  it("When the owner cancels, then the outcome is cancelled with its own exit code", async () => {
    const controller = new AbortController();
    setTimeout(() => {
      controller.abort();
    }, 20);

    const result = await executeRun([pass("a"), never("b"), pass("c")], {
      timeoutMs: 5_000,
      maxConcurrency: 1,
      signal: controller.signal,
    });

    assert.equal(result.outcome, "cancelled");
    assert.deepEqual(
      result.results.map((r) => r.status),
      ["pass", "unresolved", "not-run"],
    );
    assert.equal(exitCodeFor("cancelled"), 3);
  });
});

describe("Given a modifying request whose outcome is uncertain", () => {
  it("When no safe retry rule exists, then it is not repeated and the uncertainty is reported", () => {
    assert.deepEqual(
      decideRetry({ method: "POST", uncertain: true, safeRetry: false }),
      {
        retry: false,
        reason: "uncertain-outcome-not-safe-to-retry",
      },
    );
  });

  it("When the rule marks it safe, or the method is read-only, then a retry is allowed", () => {
    assert.equal(
      decideRetry({ method: "POST", uncertain: true, safeRetry: true }).retry,
      true,
    );
    assert.equal(
      decideRetry({ method: "GET", uncertain: true, safeRetry: false }).retry,
      true,
    );
  });

  it("When the outcome is certain, then there is nothing to retry", () => {
    assert.equal(
      decideRetry({ method: "POST", uncertain: false, safeRetry: false }).retry,
      false,
    );
  });
});

describe("Given two concurrent runs", () => {
  it("When each has a context, then state and temporary directories are separate and cleanup removes only its own", async () => {
    const a = await createRunContext("run-a");
    const b = await createRunContext("run-b");
    a.state.set("token", "a-secret");

    assert.equal(b.state.get("token"), undefined);
    assert.notEqual(a.dir, b.dir);
    await a.dispose();
    assert.equal((await import("node:fs")).existsSync(a.dir), false);
    assert.equal((await import("node:fs")).existsSync(b.dir), true);
    await b.dispose();
  });
});
