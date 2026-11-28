// Compares two operation inventories and explains each change in plain words. Conservatively, every removed
// operation and every changed operation is treated as breaking and needs review before its cases are used; only a
// purely additive diff is not breaking.
import type { OperationInfo } from "./inventory.js";

interface OperationChange {
  readonly id: string;
  readonly reasons: readonly string[];
  readonly breaking: boolean;
}

export interface InventoryDiff {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly OperationChange[];
  readonly breaking: boolean;
}

const paramKey = (p: { name: string; in: string }): string =>
  `${p.name} (${p.in})`;

function reasonsFor(before: OperationInfo, after: OperationInfo): string[] {
  const reasons: string[] = [];
  const beforeParams = new Map(before.parameters.map((p) => [paramKey(p), p]));
  const afterParams = new Map(after.parameters.map((p) => [paramKey(p), p]));
  for (const [key, p] of afterParams) {
    const old = beforeParams.get(key);
    if (p.required && !old?.required)
      reasons.push(`new required parameter ${key}`);
  }
  for (const key of beforeParams.keys()) {
    if (!afterParams.has(key)) reasons.push(`parameter ${key} removed`);
  }
  if (
    after.requestBody &&
    !before.requestBody?.required &&
    after.requestBody.required
  ) {
    reasons.push("request body is now required");
  }
  if (
    before.requestBody &&
    after.requestBody &&
    before.requestBody.schema !== after.requestBody.schema
  ) {
    reasons.push("request body schema changed");
  }
  for (const code of new Set([
    ...Object.keys(before.responses),
    ...Object.keys(after.responses),
  ])) {
    if (before.responses[code] !== after.responses[code]) {
      reasons.push(`response ${code} schema changed`);
    }
  }
  if (before.security.join() !== after.security.join()) {
    reasons.push("authentication requirements changed");
  }
  return reasons;
}

export function diffInventories(
  before: readonly OperationInfo[],
  after: readonly OperationInfo[],
): InventoryDiff {
  const old = new Map(before.map((o) => [o.id, o]));
  const next = new Map(after.map((o) => [o.id, o]));
  const added = [...next.keys()].filter((id) => !old.has(id));
  const removed = [...old.keys()].filter((id) => !next.has(id));
  const changed: OperationChange[] = [];
  for (const [id, current] of next) {
    const previous = old.get(id);
    if (!previous) continue;
    const reasons = reasonsFor(previous, current);
    if (reasons.length > 0) changed.push({ id, reasons, breaking: true });
  }
  return {
    added,
    removed,
    changed,
    breaking: removed.length > 0 || changed.length > 0,
  };
}
