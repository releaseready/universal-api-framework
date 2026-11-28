interface ScenarioContext {
  readonly signal: AbortSignal;
}

export interface Scenario {
  readonly id: string;
  run(context: ScenarioContext): Promise<"pass" | "fail">;
}

type ScenarioStatus = "pass" | "fail" | "error" | "unresolved" | "not-run";

export type RunOutcome =
  | "pass"
  | "assertion-failure"
  | "not-run"
  | "cancelled"
  | "infrastructure-error"
  | "timed-out";

export interface RunResult {
  readonly outcome: RunOutcome;
  readonly results: readonly {
    readonly id: string;
    readonly status: ScenarioStatus;
  }[];
}

export interface RunLimitsInput {
  readonly timeoutMs: number;
  readonly maxConcurrency: number;
  readonly signal?: AbortSignal;
}

const EXIT_CODES: Record<RunOutcome, number> = {
  pass: 0,
  "assertion-failure": 1,
  "not-run": 2,
  cancelled: 3,
  "infrastructure-error": 4,
  "timed-out": 4,
};

/** Distinct process exit meanings: pass, assertion failure, blocked/not run, cancellation, infrastructure. */
export function exitCodeFor(outcome: RunOutcome): number {
  return EXIT_CODES[outcome];
}

function summarise(
  results: RunResult["results"],
  stop: "cancelled" | "timed-out" | undefined,
): RunOutcome {
  if (stop !== undefined) return stop;
  if (results.length === 0) return "not-run";
  if (results.some((r) => r.status === "error")) return "infrastructure-error";
  if (results.some((r) => r.status === "fail")) return "assertion-failure";
  return "pass";
}

/**
 * Run scenarios with a concurrency bound and one time limit. After a stop, nothing new starts,
 * in-flight scenarios are reported unresolved and finished results are kept.
 */
export async function executeRun(
  scenarios: readonly Scenario[],
  limits: RunLimitsInput,
): Promise<RunResult> {
  const results: { id: string; status: ScenarioStatus }[] = scenarios.map(
    (s) => ({
      id: s.id,
      status: "not-run",
    }),
  );
  const stopper = new AbortController();
  let stop: "cancelled" | "timed-out" | undefined;
  const halt = (reason: "cancelled" | "timed-out") => {
    stop ??= reason;
    stopper.abort();
  };
  const timer = setTimeout(() => {
    halt("timed-out");
  }, limits.timeoutMs);
  const onCancel = () => {
    halt("cancelled");
  };
  if (limits.signal?.aborted === true) onCancel();
  limits.signal?.addEventListener("abort", onCancel, { once: true });
  const stopped = new Promise<"stopped">((resolve) => {
    stopper.signal.addEventListener("abort", () => {
      resolve("stopped");
    });
  });

  let next = 0;
  async function worker(): Promise<void> {
    while (!stopper.signal.aborted && next < scenarios.length) {
      const index = next++;
      const scenario = scenarios[index];
      const entry = results[index];
      if (scenario === undefined || entry === undefined) return;
      entry.status = "unresolved";
      const outcome = await Promise.race([
        scenario.run({ signal: stopper.signal }).then(
          (status) => status,
          () => "error" as const,
        ),
        stopped,
      ]);
      if (outcome !== "stopped") entry.status = outcome;
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(limits.maxConcurrency, scenarios.length) },
      worker,
    ),
  );
  clearTimeout(timer);
  limits.signal?.removeEventListener("abort", onCancel);
  return { outcome: summarise(results, stop), results };
}
