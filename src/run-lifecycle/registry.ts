import { randomUUID } from "node:crypto";

export type SubmitResult =
  | { readonly status: "accepted" | "duplicate"; readonly runId: string }
  | { readonly status: "conflict" };

/** Remembers retry keys so a repeated submission returns the same logical run instead of a second one. */
export function createRunRegistry(): {
  submit(request: { retryKey: string; inputsHash: string }): SubmitResult;
  readonly size: number;
} {
  const runs = new Map<string, { runId: string; inputsHash: string }>();
  return {
    submit({ retryKey, inputsHash }) {
      const known = runs.get(retryKey);
      if (known === undefined) {
        const runId = randomUUID();
        runs.set(retryKey, { runId, inputsHash });
        return { status: "accepted", runId };
      }
      return known.inputsHash === inputsHash
        ? { status: "duplicate", runId: known.runId }
        : { status: "conflict" };
    },
    get size() {
      return runs.size;
    },
  };
}
