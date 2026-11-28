import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface RunContext {
  readonly runId: string;
  readonly dir: string;
  readonly state: Map<string, string>;
  dispose(): Promise<void>;
}

/** Per-run state and temporary directory, so concurrent runs share nothing. */
export async function createRunContext(runId: string): Promise<RunContext> {
  const dir = await mkdtemp(join(tmpdir(), "uaf-run-"));
  return {
    runId,
    dir,
    state: new Map(),
    dispose: () => rm(dir, { recursive: true, force: true }),
  };
}
