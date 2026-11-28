// Entrypoint of the one-shot API test-runner image. Inputs come from the environment (see README "Runner image").
// Exit codes: 0 passed, 1 failures, 2 config error (including a refused target). No RR_ value other than the target
// origin, the run id and the suite glob is ever logged.
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runSuite } from "./suite.js";
import { buildSummary, exitCodeFor, type Totals } from "./summary.js";
import { resolveRunnerTarget, RunnerConfigError } from "./target.js";

const DEFAULT_SUITE = "dist/tests/smoke.test.js";
const DEFAULT_OUT_DIR = "/out";

type Env = Readonly<Record<string, string | undefined>>;

interface Dependencies {
  readonly runSuite: (suite: string, outDir: string) => Promise<Totals>;
  readonly log: (line: string) => void;
}

function valueOrDefault(value: string | undefined, fallback: string): string {
  return value === undefined || value === "" ? fallback : value;
}

export async function runRunner(
  env: Env,
  dependencies: Dependencies = { runSuite, log: console.log },
): Promise<0 | 1 | 2> {
  const { log } = dependencies;
  let target: URL;
  try {
    target = resolveRunnerTarget(env);
  } catch (error) {
    if (error instanceof RunnerConfigError) {
      log(`Config error: ${error.message}`);
      return exitCodeFor("config-error");
    }
    throw error;
  }
  const runId = valueOrDefault(env.RR_RUN_ID, randomUUID());
  const suite = valueOrDefault(env.RR_SUITE, DEFAULT_SUITE);
  const outDir = join(valueOrDefault(env.RR_OUT_DIR, DEFAULT_OUT_DIR), runId);
  mkdirSync(outDir, { recursive: true });
  log(`Run ${runId}: suite ${suite} against ${target.origin}`);

  const started = Date.now();
  const totals = await dependencies.runSuite(suite, outDir);
  const summary = buildSummary({
    runId,
    target,
    suite,
    totals,
    durationMs: Date.now() - started,
  });
  writeFileSync(
    join(outDir, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  log(
    `Run ${runId}: ${String(totals.passed)} passed, ${String(totals.failed)} failed, exit ${String(summary.exitCode)}`,
  );
  return summary.exitCode;
}
