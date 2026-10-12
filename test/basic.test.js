import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, mkdtemp, writeFile as put } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOpenAPI } from "../src/parser.js";
import { generateCode } from "../src/generator.js";
import { main } from "../src/cli.js";

const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

const yaml = `openapi: 3.0.3\ninfo: {title: Demo, version: '1'}\nservers: [{url: https://example.com/api}]\npaths:\n  /things/{id}:\n    get:\n      operationId: fetchThing\n      parameters:\n        - {name: id, in: path, required: true, schema: {type: string}}\n        - {name: q, in: query, schema: {type: string}}\n      responses: {'200': {description: ok}}\n`;

test("parses YAML and path/query parameters", () => {
  const result = parseOpenAPI(yaml);
  assert.equal(result.operations[0].name, "fetchThing");
  assert.equal(result.operations[0].inputSchema.required[0], "id");
  assert.equal(result.operations[0].parameters[1].in, "query");
});

test("generates JavaScript WebMCP registration and Fetch request code", () => {
  const code = generateCode(parseOpenAPI(yaml));
  assert.match(code, /document\?\.modelContext/);
  assert.match(code, /registerTool\(tool\)/);
  assert.match(code, /fetchImpl\(url/);
  assert.match(code, /fetchThing/);
  new Function(code.replace(/^export /gm, ""));
});

test("generates TypeScript and protects runtime credentials", () => {
  const code = generateCode(parseOpenAPI(yaml), { lang: "ts", auth: "bearer" });
  assert.match(code, /export interface WebMCPOptions/);
  assert.match(code, /credentials are never embedded/);
  assert.match(code, /inputSchema/);
});

test("generated TypeScript type-checks", async () => {
  const folder = await mkdtemp(join(tmpdir(), "webmcp-ts-"));
  const filename = join(folder, "webmcp.ts");
  await put(filename, generateCode(parseOpenAPI(yaml), { lang: "ts" }));
  const compiler = fileURLToPath(
    new URL("../node_modules/typescript/bin/tsc", import.meta.url),
  );
  const result = spawnSync(
    process.execPath,
    [
      compiler,
      "--noEmit",
      "--target",
      "es2022",
      "--module",
      "esnext",
      "--lib",
      "es2022,dom",
      filename,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

test("CLI validates and writes output end to end", async () => {
  const folder = await mkdtemp(join(tmpdir(), "webmcp-"));
  const input = join(folder, "api.yaml"),
    output = join(folder, "generated.js");
  await put(input, yaml);
  const messages = [];
  const originalLog = console.log;
  console.log = (...args) => messages.push(args.join(" "));
  try {
    assert.equal(await main(["-i", input, "-o", output]), 0);
  } finally {
    console.log = originalLog;
  }
  assert.match(await readFile(output, "utf8"), /fetchThing/);
  assert.match(messages.join("\n"), new RegExp(`openapi-to-webmcp v${version.replaceAll(".", "\\.")}`));
  assert.match(messages.join("\n"), /OpenAPI: 3\.0\.3/);
  assert.match(messages.join("\n"), /API:\s+Demo/);
  assert.match(
    messages.join("\n"),
    new RegExp(
      `Input:\\s+api\\.yaml \\(${input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`,
    ),
  );
  assert.match(
    messages.join("\n"),
    new RegExp(
      `Output:\\s+generated\\.js \\(${output.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`,
    ),
  );
  assert.match(messages.join("\n"), /Format:\s+JavaScript/);
});

test("CLI does not overwrite output unless forced", async () => {
  const folder = await mkdtemp(join(tmpdir(), "webmcp-"));
  const input = join(folder, "api.yml"),
    output = join(folder, "generated.js");
  await put(input, yaml);
  await put(output, "keep me");
  const errors = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => {};
  console.error = (...args) => errors.push(args.join(" "));
  try {
    assert.equal(await main(["-i", input, "-o", output]), 1);
    assert.equal(await readFile(output, "utf8"), "keep me");
    assert.match(errors.join("\n"), /Use --force/);
    assert.equal(await main(["-i", input, "-o", output, "--force"]), 0);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  assert.match(await readFile(output, "utf8"), /fetchThing/);
});

test("rejects unsupported OpenAPI versions and bad CLI arguments", async () => {
  assert.throws(
    () => parseOpenAPI("openapi: 2.0\ninfo: {title: x, version: y}\npaths: {}"),
    /Only OpenAPI 3/,
  );
  assert.throws(
    () =>
      parseOpenAPI('{\n  "openapi": "3.1.0",\n}', { filename: "broken.json" }),
    /broken\.json at line \d+, column \d+/,
  );
  const unresolved = `openapi: 3.1.0\ninfo: {title: Broken, version: '1'}\npaths:\n  /things:\n    get:\n      responses:\n        '200':\n          description: OK\n          content:\n            application/json:\n              schema: {$ref: '#/components/schemas/Missing'}\n`;
  assert.throws(
    () => parseOpenAPI(unresolved, { filename: "broken.yaml" }),
    /Could not process OpenAPI path "\/things" in broken\.yaml.*Unresolved local reference/,
  );
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(await main(["--nope"]), 2);
  } finally {
    console.error = originalError;
  }
});
