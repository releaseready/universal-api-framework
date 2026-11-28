// In-memory, tenant-scoped store of immutable OpenAPI versions. It is the logic slice of RRDAPI-14: no persistence,
// encryption, authentication or target access, and callers must supply the already authenticated scope. Documents
// are validated offline first; a rejected import returns only a failure code, never document text.
import { createRequire } from "node:module";
import { validateDocumentSchema } from "../intake/preflight.js";
import type {
  PreflightPolicy,
  SchemaFailureCode,
} from "../intake/preflight.js";
import { diffInventories } from "./diff.js";
import type { InventoryDiff } from "./diff.js";
import { NORMALIZATION_VERSION, normalizeDocument, sha256 } from "./hash.js";
import { buildInventory } from "./inventory.js";
import type { InventoryProblem, OperationInfo } from "./inventory.js";

export interface Scope {
  readonly tenantId: string;
  readonly applicationId: string;
}

export interface ImportRequest {
  readonly filename: string;
  readonly importer: string;
  readonly source: string;
  readonly format: "json" | "yaml";
  readonly now: Date;
}

export interface OpenApiVersion {
  readonly versionNumber: number;
  readonly filename: string;
  readonly declaredApiVersion: string;
  readonly importedAt: string;
  readonly importer: string;
  readonly originalHash: string;
  readonly normalizedHash: string;
  readonly parserVersion: string;
  readonly normalizationVersion: string;
}

export type ImportResult =
  | { status: "created" | "unchanged"; version: OpenApiVersion }
  | { status: "rejected"; code: SchemaFailureCode };

interface StoredVersion {
  readonly version: OpenApiVersion;
  readonly operations: readonly OperationInfo[];
  readonly problems: readonly InventoryProblem[];
}

const parserVersion = `swagger-parser@${
  (
    createRequire(import.meta.url)(
      "@apidevtools/swagger-parser/package.json",
    ) as { version: string }
  ).version
}`;

// A NUL cannot occur in either id, so distinct scopes never share a key.
const keyOf = (scope: Scope): string =>
  `${scope.tenantId}\u0000${scope.applicationId}`;

export class OpenApiVersionStore {
  readonly #policy: PreflightPolicy;
  readonly #versions = new Map<string, StoredVersion[]>();

  constructor(policy: PreflightPolicy) {
    this.#policy = policy;
  }

  async import(scope: Scope, request: ImportRequest): Promise<ImportResult> {
    const validation = await validateDocumentSchema(
      request.source,
      request.format,
      this.#policy,
    );
    if (validation.status === "rejected")
      return { status: "rejected", code: validation.code };

    const normalized = normalizeDocument(request.source);
    const normalizedHash = sha256(normalized);
    const list = this.#versions.get(keyOf(scope)) ?? [];
    const existing = list.find(
      (s) => s.version.normalizedHash === normalizedHash,
    );
    if (existing) return { status: "unchanged", version: existing.version };

    const doc = JSON.parse(normalized) as Record<string, unknown>;
    const info = doc.info as { version?: unknown } | undefined;
    const version: OpenApiVersion = Object.freeze({
      versionNumber: list.length + 1,
      filename: request.filename,
      declaredApiVersion: typeof info?.version === "string" ? info.version : "",
      importedAt: request.now.toISOString(),
      importer: request.importer,
      originalHash: sha256(request.source),
      normalizedHash,
      parserVersion,
      normalizationVersion: NORMALIZATION_VERSION,
    });
    const { operations, problems } = buildInventory(doc);
    this.#versions.set(keyOf(scope), [
      ...list,
      { version, operations, problems },
    ]);
    return { status: "created", version };
  }

  list(scope: Scope): readonly OpenApiVersion[] {
    return (this.#versions.get(keyOf(scope)) ?? []).map((s) => s.version);
  }

  get(scope: Scope, versionNumber: number): OpenApiVersion | undefined {
    return this.#find(scope, versionNumber)?.version;
  }

  inventory(
    scope: Scope,
    versionNumber: number,
  ):
    | {
        operations: readonly OperationInfo[];
        problems: readonly InventoryProblem[];
      }
    | undefined {
    const stored = this.#find(scope, versionNumber);
    return (
      stored && { operations: stored.operations, problems: stored.problems }
    );
  }

  diff(scope: Scope, from: number, to: number): InventoryDiff | undefined {
    const a = this.#find(scope, from);
    const b = this.#find(scope, to);
    return a && b ? diffInventories(a.operations, b.operations) : undefined;
  }

  #find(scope: Scope, versionNumber: number): StoredVersion | undefined {
    return this.#versions.get(keyOf(scope))?.[versionNumber - 1];
  }
}
