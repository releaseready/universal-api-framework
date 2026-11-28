// Declares a node:test case that carries a stable case ID in its title and records its outcome in a CaseReport.
import { it } from "node:test";
import type { CaseReport } from "./case-report.js";

export function defineCase(
  report: CaseReport,
): (caseId: string, title: string, body: () => Promise<void>) => void {
  return (caseId, title, body) => {
    it(`[${caseId}] ${title}`, async () => {
      const started = Date.now();
      try {
        await body();
        report.record(caseId, "passed", Date.now() - started);
      } catch (error) {
        report.record(
          caseId,
          "failed",
          Date.now() - started,
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      }
    });
  };
}
