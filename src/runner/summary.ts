// Counts the test results of a run and shapes the summary.json the runner writes. It holds the target's origin only,
// never a path, query or token.

export interface Totals {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
}

export interface Summary {
  readonly runId: string;
  readonly target: string;
  readonly suite: string;
  readonly totals: Totals;
  readonly durationMs: number;
  readonly exitCode: 0 | 1;
}

/** The part of a node:test event the collector reads. */
export interface TestEvent {
  readonly type: string;
  readonly data: {
    readonly skip?: unknown;
    readonly todo?: unknown;
    readonly details?: { readonly type?: string };
  };
}

export class SummaryCollector {
  private passed = 0;
  private failed = 0;
  private skipped = 0;

  record(event: TestEvent): void {
    if (event.type !== "test:pass" && event.type !== "test:fail") {
      return;
    }
    if (event.data.details?.type === "suite") {
      return;
    }
    if (event.type === "test:fail") {
      this.failed += 1;
    } else if (event.data.skip !== undefined || event.data.todo !== undefined) {
      this.skipped += 1;
    } else {
      this.passed += 1;
    }
  }

  totals(): Totals {
    return {
      total: this.passed + this.failed + this.skipped,
      passed: this.passed,
      failed: this.failed,
      skipped: this.skipped,
    };
  }
}

/** 0 passed, 1 failures (or no test ran), 2 config error. */
export function exitCodeFor(outcome: Totals | "config-error"): 0 | 1 | 2 {
  if (outcome === "config-error") {
    return 2;
  }
  return outcome.failed === 0 && outcome.total > 0 ? 0 : 1;
}

export function buildSummary(input: {
  readonly runId: string;
  readonly target: URL;
  readonly suite: string;
  readonly totals: Totals;
  readonly durationMs: number;
}): Summary {
  return {
    runId: input.runId,
    target: input.target.origin,
    suite: input.suite,
    totals: input.totals,
    durationMs: input.durationMs,
    exitCode: exitCodeFor(input.totals) === 0 ? 0 : 1,
  };
}
