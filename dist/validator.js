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

export function validateOpenAPI(spec) {
  const errors = [];
  if (!spec || typeof spec !== "object" || Array.isArray(spec))
    return ["The document must be a JSON object."];
  if (typeof spec.openapi !== "string" || !/^3\.(0|1)\.\d+/.test(spec.openapi))
    errors.push(
      'Only OpenAPI 3.0.x and 3.1.x specifications are supported (expected an "openapi" field such as "3.1.0").',
    );
  if (
    !spec.info ||
    typeof spec.info.title !== "string" ||
    typeof spec.info.version !== "string"
  )
    errors.push(
      'The "info" object must contain string "title" and "version" fields.',
    );
  if (
    !spec.paths ||
    typeof spec.paths !== "object" ||
    Array.isArray(spec.paths)
  )
    errors.push('The "paths" field must be an object.');
  else
    for (const [path, item] of Object.entries(spec.paths)) {
      if (!path.startsWith("/"))
        errors.push(`Path "${path}" must start with "/".`);
      if (!item || typeof item !== "object")
        errors.push(`Path item "${path}" must be an object.`);
      else
        for (const [method, op] of Object.entries(item))
          if (
            METHODS.has(method.toLowerCase()) &&
            (!op || typeof op !== "object")
          )
            errors.push(`${method.toUpperCase()} ${path} must be an object.`);
    }
  return errors;
}

export function resolveRef(spec, ref) {
  if (typeof ref !== "string" || !ref.startsWith("#/"))
    throw new Error(
      `Only local JSON Pointer references are supported: ${String(ref)}`,
    );
  return ref
    .slice(2)
    .split("/")
    .map((s) => s.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((value, key) => {
      if (value == null || !Object.hasOwn(value, key))
        throw new Error(`Unresolved local reference: ${ref}`);
      return value[key];
    }, spec);
}
