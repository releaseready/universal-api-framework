// Operation inventory of a validated OpenAPI 3.0 document: every operation with a stable identity, its parameters,
// request body, response schemas and authentication requirements, each traceable to a source pointer. Nothing here
// calls the documented servers. Local references are resolved by reading the document only.
interface ParameterInfo {
  readonly name: string;
  readonly in: string;
  readonly required: boolean;
}

export interface OperationInfo {
  /** operationId when present and unique, otherwise `METHOD path`. */
  readonly id: string;
  readonly method: string;
  readonly path: string;
  /** JSON Pointer fragment of the operation in the source document. */
  readonly pointer: string;
  readonly parameters: readonly ParameterInfo[];
  readonly requestBody?: {
    readonly required: boolean;
    readonly schema: string;
  };
  /** Status code to the canonical text of its resolved JSON schema ("" when the response has no body). */
  readonly responses: Readonly<Record<string, string>>;
  readonly security: readonly string[];
}

export interface InventoryProblem {
  readonly code:
    "missing-operation-id" | "duplicate-operation-id" | "unresolved-schema";
  readonly pointer: string;
}

type Json = Record<string, unknown>;

const METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
];
const MAX_REF_DEPTH = 32;

const isObject = (value: unknown): value is Json =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const escapePointer = (token: string): string =>
  token.replaceAll("~", "~0").replaceAll("/", "~1");
const unescapePointer = (token: string): string =>
  token.replaceAll("~1", "/").replaceAll("~0", "~");

function lookup(root: Json, ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined;
  let node: unknown = root;
  for (const token of ref.slice(2).split("/").map(unescapePointer)) {
    if (!isObject(node) || !Object.hasOwn(node, token)) return undefined;
    node = node[token];
  }
  return node;
}

/** Inlines local references so a change anywhere in a referenced schema changes the fingerprint. */
function resolve(
  root: Json,
  node: unknown,
  pointer: string,
  problems: InventoryProblem[],
  depth = 0,
): unknown {
  if (Array.isArray(node))
    return node.map((n) => resolve(root, n, pointer, problems, depth));
  if (!isObject(node)) return node;
  if (typeof node.$ref === "string") {
    const target = lookup(root, node.$ref);
    if (target === undefined || depth >= MAX_REF_DEPTH) {
      problems.push({ code: "unresolved-schema", pointer });
      return { $unresolved: node.$ref };
    }
    return resolve(root, target, pointer, problems, depth + 1);
  }
  return Object.fromEntries(
    Object.entries(node).map(([key, child]) => [
      key,
      resolve(root, child, pointer, problems, depth),
    ]),
  );
}

const fingerprint = (value: unknown): string => JSON.stringify(value);

function jsonSchema(
  root: Json,
  content: unknown,
  pointer: string,
  problems: InventoryProblem[],
): string {
  if (!isObject(content)) return "";
  const media = content["application/json"] ?? Object.values(content)[0];
  if (!isObject(media) || media.schema === undefined) return "";
  return fingerprint(
    resolve(root, media.schema, `${pointer}/content`, problems),
  );
}

function securityNames(requirements: unknown): string[] {
  if (!Array.isArray(requirements)) return [];
  return [
    ...new Set(requirements.filter(isObject).flatMap((r) => Object.keys(r))),
  ].sort();
}

export function buildInventory(doc: Json): {
  operations: OperationInfo[];
  problems: InventoryProblem[];
} {
  const problems: InventoryProblem[] = [];
  const drafts: { op: Json; method: string; path: string; pointer: string }[] =
    [];
  const paths = isObject(doc.paths) ? doc.paths : {};
  for (const [path, item] of Object.entries(paths)) {
    if (!isObject(item)) continue;
    for (const method of METHODS.filter((m) => isObject(item[m]))) {
      drafts.push({
        op: item[method] as Json,
        method: method.toUpperCase(),
        path,
        pointer: `#/paths/${escapePointer(path)}/${method}`,
      });
    }
  }

  const counts = new Map<string, number>();
  for (const { op } of drafts) {
    if (typeof op.operationId === "string") {
      counts.set(op.operationId, (counts.get(op.operationId) ?? 0) + 1);
    }
  }

  const operations = drafts.map(
    ({ op, method, path, pointer }): OperationInfo => {
      const declared =
        typeof op.operationId === "string" ? op.operationId : undefined;
      if (declared === undefined)
        problems.push({ code: "missing-operation-id", pointer });
      else if ((counts.get(declared) ?? 0) > 1)
        problems.push({ code: "duplicate-operation-id", pointer });
      const unique = declared !== undefined && counts.get(declared) === 1;

      const pathItem = paths[path] as Json;
      const parameters = [pathItem.parameters, op.parameters]
        .flatMap((list: unknown) =>
          Array.isArray(list) ? (list as unknown[]) : [],
        )
        .map((p) => resolve(doc, p, `${pointer}/parameters`, problems))
        .filter(isObject)
        .map((p) => ({
          name: String(p.name),
          in: String(p.in),
          required: p.required === true,
        }));

      const responses: Record<string, string> = {};
      const responseMap = isObject(op.responses) ? op.responses : {};
      for (const [code, response] of Object.entries(responseMap)) {
        const resolved = resolve(
          doc,
          response,
          `${pointer}/responses/${code}`,
          problems,
        );
        responses[code] = isObject(resolved)
          ? jsonSchema(
              doc,
              resolved.content,
              `${pointer}/responses/${code}`,
              problems,
            )
          : "";
      }

      const body = resolve(
        doc,
        op.requestBody,
        `${pointer}/requestBody`,
        problems,
      );
      return {
        id: unique ? declared : `${method} ${path}`,
        method,
        path,
        pointer,
        parameters,
        ...(isObject(body)
          ? {
              requestBody: {
                required: body.required === true,
                schema: jsonSchema(
                  doc,
                  body.content,
                  `${pointer}/requestBody`,
                  problems,
                ),
              },
            }
          : {}),
        responses,
        security: securityNames(op.security ?? doc.security),
      };
    },
  );
  return { operations, problems };
}
