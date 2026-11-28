// Collects one result per stable case ID so a run can be reported to Test Management. The report is plain JSON;
// the ingest adapter is a separate step (RRDTM-97).
export type CaseStatus = "passed" | "failed";

export interface CaseResult {
  readonly caseId: string;
  readonly status: CaseStatus;
  readonly durationMs: number;
  readonly message?: string;
}

const CASE_ID = /^API-[A-Z]+-\d{3}$/;

export class CaseReport {
  readonly #results: CaseResult[] = [];

  constructor(readonly profile: string) {}

  record(
    caseId: string,
    status: CaseStatus,
    durationMs: number,
    message?: string,
  ): void {
    if (!CASE_ID.test(caseId)) {
      throw new TypeError(
        `Malformed case ID ${caseId}; expected API-<AREA>-<NNN>.`,
      );
    }
    if (this.#results.some((r) => r.caseId === caseId)) {
      throw new TypeError(`Case ${caseId} is already recorded.`);
    }
    this.#results.push({
      caseId,
      status,
      durationMs,
      ...(message === undefined ? {} : { message }),
    });
  }

  toJSON(): { profile: string; results: readonly CaseResult[] } {
    return { profile: this.profile, results: [...this.#results] };
  }
}
