// Test classification: unit
// Review status: Not Reviewed
// Evidence: synthetic
// Scope: request spacing against a fake clock; it does not measure real wall-clock rates.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRateLimiter } from "../src/run-lifecycle/index.js";

describe("Given a request rate limit", () => {
  it("When requests are acquired back to back, then they are spaced by the interval", async () => {
    let time = 0;
    const sleeps: number[] = [];
    const limiter = createRateLimiter(5, {
      now: () => time,
      sleep: (ms) => {
        sleeps.push(ms);
        time += ms;
        return Promise.resolve();
      },
    });

    for (let i = 0; i < 3; i += 1) await limiter.acquire();

    assert.deepEqual(sleeps, [200, 200]);
  });

  it("When the limit is not a positive whole number, then it is rejected", () => {
    assert.throws(() => createRateLimiter(0), /positive whole number/);
    assert.throws(() => createRateLimiter(1.5), /positive whole number/);
  });
});
