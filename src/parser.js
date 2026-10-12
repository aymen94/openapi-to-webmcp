import { parse as parseYaml } from "yaml";
import { validateOpenAPI, resolveRef } from "./validator.js";

const METHODS = new Set([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
]);
const deref = (spec, node, seen = new Set()) => {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map((n) => deref(spec, n, seen));
  if (!node.$ref)
    return Object.fromEntries(
      Object.entries(node).map(([k, v]) => [k, deref(spec, v, seen)]),
    );
  if (seen.has(node.$ref))
    throw new Error(`Circular reference cannot be expanded: ${node.$ref}`);
  return deref(
    spec,
    resolveRef(spec, node.$ref),
    new Set([...seen, node.$ref]),
  );
};
const mergeParameters = (path, op) => {
  const map = new Map();
  for (const p of [...(path.parameters ?? []), ...(op.parameters ?? [])])
    map.set(`${p.in}:${p.name}`, p);
  return [...map.values()];
};

export function parseOpenAPI(source, { filename = "openapi.yaml" } = {}) {
  let spec;
  try {
    spec = /\.json$/i.test(filename) ? JSON.parse(source) : parseYaml(source);
  } catch (error) {
    let location = "";
    if (Array.isArray(error.linePos) && error.linePos[0]) {
      location = ` at line ${error.linePos[0].line}, column ${error.linePos[0].col}`;
    } else {
      const match = /position\s+(\d+)/i.exec(error.message);
      if (match) {
        const position = Number(match[1]);
        const beforeError = source.slice(0, position);
        const line = beforeError.split("\n").length;
        const column = position - beforeError.lastIndexOf("\n");
        location = ` at line ${line}, column ${column}`;
      }
    }
    throw new Error(
      `Could not parse ${filename}${location}: ${error.message}`,
      { cause: error },
    );
  }
  const errors = validateOpenAPI(spec);
  if (errors.length)
    throw new Error(
      `Invalid OpenAPI document in ${filename}:\n- ${errors.join("\n- ")}`,
    );
  const warnings = [];
  const operations = [];
  for (const [path, pathItemRaw] of Object.entries(spec.paths)) {
    let pathItem;
    try {
      pathItem = deref(spec, pathItemRaw);
    } catch (error) {
      throw new Error(
        `Could not process OpenAPI path "${path}" in ${filename}: ${error.message}`,
        { cause: error },
      );
    }
    for (const [method, raw] of Object.entries(pathItem)) {
      if (!METHODS.has(method.toLowerCase())) continue;
      try {
        const op = deref(spec, raw);
        if (op["x-webmcp-skip"]) {
          warnings.push(
            `Skipping ${method.toUpperCase()} ${path}: x-webmcp-skip is set.`,
          );
          continue;
        }
        const id =
          op.operationId ||
          `${method}_${path.replace(/^\//, "").replace(/\//g, "_").replace(/[{}]/g, "") || "root"}`;
        const params = mergeParameters(pathItem, op).map((p) => ({
          name: p.name,
          in: p.in,
          required: !!p.required,
          schema: deref(spec, p.schema ?? { type: "string" }),
          description: p.description ?? "",
        }));
        const body = op.requestBody && deref(spec, op.requestBody);
        const media =
          body?.content?.["application/json"] ??
          Object.values(body?.content ?? {})[0];
        const requestSchema = media?.schema
          ? deref(spec, media.schema)
          : undefined;
        if (requestSchema && ["GET", "HEAD"].includes(method.toUpperCase())) {
          warnings.push(
            `Skipping ${method.toUpperCase()} ${path}: Fetch does not support request bodies for this method.`,
          );
          continue;
        }
        if (requestSchema && params.some((p) => p.name === "body")) {
          warnings.push(
            `Skipping ${method.toUpperCase()} ${path}: a parameter named "body" conflicts with the request body argument.`,
          );
          continue;
        }
        const response = Object.values(op.responses ?? {}).find(
          (r) => r?.content,
        );
        const responseMedia =
          response?.content?.["application/json"] ??
          Object.values(response?.content ?? {})[0];
        const responseSchema = responseMedia?.schema
          ? deref(spec, responseMedia.schema)
          : undefined;
        const inputProperties = Object.fromEntries(
          params.map((p) => [
            p.name,
            {
              ...p.schema,
              ...(p.description ? { description: p.description } : {}),
            },
          ]),
        );
        const required = params.filter((p) => p.required).map((p) => p.name);
        if (requestSchema) {
          inputProperties.body = {
            ...requestSchema,
            description: body.required
              ? "Request body"
              : "Optional request body",
          };
          if (body.required) required.push("body");
        }
        const unsupported = params.find(
          (p) => !["path", "query", "header", "cookie"].includes(p.in),
        );
        if (unsupported) {
          warnings.push(
            `Skipping ${method.toUpperCase()} ${path}: unsupported parameter location "${unsupported.in}".`,
          );
          continue;
        }
        if (params.some((p) => p.in === "cookie")) {
          warnings.push(
            `${method.toUpperCase()} ${path}: cookie parameter values are sent in a Cookie header; browser runtimes may restrict this header.`,
          );
        }
        operations.push({
          method: method.toUpperCase(),
          path,
          operationId: id,
          summary: op.summary ?? "",
          description: op.description ?? "",
          tags: op.tags ?? [],
          parameters: params,
          requestSchema,
          responseSchema,
          requestRequired: !!body?.required,
          inputSchema: {
            type: "object",
            properties: inputProperties,
            required,
            additionalProperties: false,
          },
        });
      } catch (error) {
        throw new Error(
          `Could not process ${method.toUpperCase()} ${path} in ${filename}: ${error.message}`,
          { cause: error },
        );
      }
    }
  }
  const used = new Set();
  for (const op of operations) {
    let name = op.operationId
      .replace(/[^A-Za-z0-9_-]/g, "_")
      .replace(/^[^A-Za-z_]+/, "");
    if (!name) name = "api_operation";
    const base = name;
    let suffix = 2;
    while (used.has(name)) name = `${base}_${suffix++}`;
    used.add(name);
    op.name = name;
  }
  const server = spec.servers?.[0]?.url ?? "";
  return {
    title: spec.info.title,
    version: spec.info.version,
    server,
    operations,
    warnings,
    spec,
  };
}

export function parseOpenAPIObject(spec) {
  return parseOpenAPI(JSON.stringify(spec), { filename: "openapi.json" });
}
