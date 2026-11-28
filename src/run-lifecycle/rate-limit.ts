export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** Space requests at least 1000/maxRequestsPerSecond ms apart; callers await `acquire` before each request. */
export function createRateLimiter(
  maxRequestsPerSecond: number,
  clock: Clock = realClock,
): { acquire(): Promise<void> } {
  if (!Number.isInteger(maxRequestsPerSecond) || maxRequestsPerSecond <= 0) {
    throw new RangeError(
      "maxRequestsPerSecond must be a positive whole number.",
    );
  }
  const interval = 1000 / maxRequestsPerSecond;
  let nextSlot = 0;
  return {
    async acquire() {
      const slot = Math.max(nextSlot, clock.now());
      nextSlot = slot + interval;
      const wait = slot - clock.now();
      if (wait > 0) await clock.sleep(wait);
    },
  };
}
