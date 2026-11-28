// Content hashes for OpenAPI versions. The original hash covers the exact bytes the customer sent; the normalized
// hash covers canonical JSON (RFC 8785 via the maintained `canonicalize` package; comments, whitespace and key order dropped), so re-formatting a
// document is not a new version while any semantic change is. Bump NORMALIZATION_VERSION when canonicalisation
// changes, because old and new normalized hashes are not comparable.
import { createHash } from "node:crypto";
import canonicalize from "canonicalize";
import { parse } from "yaml";

export const NORMALIZATION_VERSION = "1";

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Canonical JSON text of an already validated JSON or YAML document. */
export function normalizeDocument(source: string): string {
  return canonicalize(parse(source) as unknown) ?? "";
}
