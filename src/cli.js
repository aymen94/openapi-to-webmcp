#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { readFileSync as readSync } from "node:fs";
import { dirname, resolve, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOpenAPI } from "./parser.js";
import { generateCode } from "./generator.js";

const { version: VERSION } = JSON.parse(
  readSync(new URL("../package.json", import.meta.url), "utf8"),
);
const HELP = `openapi-to-webmcp ${VERSION}

Usage: openapi-to-webmcp [options] <openapi-file>

Options:
  -i, --input <file>       OpenAPI JSON/YAML file, or - for stdin
  -o, --output <file>      Output file (default: webmcp.js or webmcp.ts)
      --lang <js|ts>       Output language (default: js)
  -t, --typescript         Shortcut for --lang ts
      --base-url <url>     Override the first OpenAPI server URL
      --include <items>    Comma-separated tags, operationIds, or tool names
      --exclude <items>    Comma-separated tags, operationIds, or tool names
      --auth <strategy>    Runtime strategy: bearer, api-key, basic, custom
      --pretty             Accepted; output is already formatted
      --check              Validate without writing a file
      --force              Overwrite an existing output file
      --debug              Include stack traces in error output
  -h, --help               Show this help
  -V, --version            Show version
`;

class UsageError extends Error {}

function parseArgs(argv) {
  const opts = { lang: "js", include: [], exclude: [] };
  const values = new Map([
    ["-i", "input"],
    ["--input", "input"],
    ["-o", "output"],
    ["--output", "output"],
    ["--lang", "lang"],
    ["--base-url", "baseUrl"],
    ["--include", "include"],
    ["--exclude", "exclude"],
    ["--auth", "auth"],
  ]);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      opts.help = true;
      continue;
    }
    if (arg === "--version" || arg === "-V") {
      opts.version = true;
      continue;
    }
    if (arg === "--check") {
      opts.check = true;
      continue;
    }
    if (arg === "--pretty") {
      opts.pretty = true;
      continue;
    }
    if (arg === "--force") {
      opts.force = true;
      continue;
    }
    if (arg === "--debug") {
      opts.debug = true;
      continue;
    }
    if (arg === "--typescript" || arg === "-t") {
      if (opts.langExplicit && opts.lang !== "ts")
        throw new UsageError("--typescript conflicts with --lang js.");
      opts.lang = "ts";
      opts.typescript = true;
      continue;
    }
    if (values.has(arg)) {
      const key = values.get(arg);
      if (opts[key] !== undefined && !["include", "exclude"].includes(key)) {
        throw new UsageError(`Option ${arg} was provided more than once.`);
      }
      const value = argv[++i];
      if (!value || (value.startsWith("-") && value !== "-"))
        throw new UsageError(`Option ${arg} requires a value.`);
      if (key === "include" || key === "exclude") {
        opts[key].push(
          ...value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        );
      } else {
        opts[key] = value;
        if (key === "lang") opts.langExplicit = true;
      }
      continue;
    }
    if (arg.startsWith("-")) throw new UsageError(`Unknown option: ${arg}`);
    if (opts.input)
      throw new UsageError("Only one input file can be specified.");
    opts.input = arg;
  }

  if (!["js", "ts"].includes(opts.lang))
    throw new UsageError('--lang must be "js" or "ts".');
  if (opts.typescript && opts.langExplicit && opts.lang !== "ts")
    throw new UsageError("--typescript conflicts with --lang js.");
  if (
    opts.auth &&
    !["bearer", "api-key", "basic", "custom"].includes(opts.auth)
  ) {
    throw new UsageError("--auth must be bearer, api-key, basic, or custom.");
  }
  if (opts.output && opts.check)
    throw new UsageError("--output cannot be combined with --check.");
  if (opts.force && opts.check)
    throw new UsageError("--force cannot be combined with --check.");
  return opts;
}

function readStdin() {
  return new Promise((resolvePromise, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolvePromise(data));
    process.stdin.on("error", reject);
  });
}

function validateBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new UsageError("--base-url must be an absolute HTTP or HTTPS URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new UsageError(
      "--base-url must use HTTP or HTTPS and must not contain credentials.",
    );
  }
}

function printSummary({ api, inputName, inputPath, outputPath, lang, check }) {
  const color = process.stdout.isTTY && !process.env.NO_COLOR;
  const green = (value) => (color ? `\u001b[32m${value}\u001b[39m` : value);
  console.log(`${green("Success")} openapi-to-webmcp v${VERSION}`);
  console.log(`  OpenAPI: ${api.spec.openapi}`);
  console.log(`  API:     ${api.title}`);
  console.log(`  Input:   ${inputName}${inputPath ? ` (${inputPath})` : ""}`);
  console.log(
    `  Output:  ${check ? "not written (--check)" : basename(outputPath)} (${outputPath})`,
  );
  console.log(`  Format:  ${lang === "ts" ? "TypeScript" : "JavaScript"}`);
}

export async function main(argv = process.argv.slice(2)) {
  let opts;
  try {
    opts = parseArgs(argv);
    if (opts.help) {
      console.log(HELP);
      return 0;
    }
    if (opts.version) {
      console.log(VERSION);
      return 0;
    }
    if (!opts.input)
      throw new UsageError(
        "An input file is required (use -i <file> or -i - for stdin).",
      );

    const inputPath = opts.input === "-" ? undefined : resolve(opts.input);
    if (
      inputPath &&
      ![".json", ".yaml", ".yml"].includes(extname(inputPath).toLowerCase())
    ) {
      throw new UsageError(
        "Input files must use the .json, .yaml, or .yml extension.",
      );
    }
    if (opts.baseUrl) validateBaseUrl(opts.baseUrl);
    const source =
      opts.input === "-"
        ? await readStdin()
        : await readFile(inputPath, "utf8");
    const inputName = opts.input === "-" ? "stdin" : basename(inputPath);
    const api = parseOpenAPI(source, { filename: inputPath ?? "<stdin>.yaml" });
    for (const warning of api.warnings) console.warn(`Warning: ${warning}`);

    const extension = extname(opts.output ?? "").toLowerCase();
    const lang =
      opts.langExplicit || opts.typescript
        ? opts.lang
        : extension === ".ts"
          ? "ts"
          : "js";
    if (extension && ![".js", ".ts"].includes(extension)) {
      throw new UsageError("Output files must use the .js or .ts extension.");
    }
    if (extension && extension !== `.${lang}`) {
      throw new UsageError(
        `Output extension .${extension.slice(1)} conflicts with ${lang === "ts" ? "TypeScript" : "JavaScript"} output.`,
      );
    }

    const outputPath = resolve(opts.output ?? `webmcp.${lang}`);
    if (!opts.check) {
      const code = generateCode(api, {
        lang,
        baseUrl: opts.baseUrl,
        auth: opts.auth ?? "none",
        include: opts.include,
        exclude: opts.exclude,
      });
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, code, {
        encoding: "utf8",
        flag: opts.force ? "w" : "wx",
      });
    }
    printSummary({
      api,
      inputName,
      inputPath,
      outputPath,
      lang,
      check: opts.check,
    });
    return 0;
  } catch (error) {
    const debug = opts?.debug || argv.includes("--debug");
    const prefix = error instanceof UsageError ? "Usage error" : "Error";
    const message =
      error.code === "EEXIST"
        ? `Output file already exists: ${error.path ?? "the requested path"}. Use --force to replace it.`
        : error.message;
    console.error(`${prefix}: ${message}`);
    if (debug && error.stack) console.error(error.stack);
    return error instanceof UsageError ? 2 : 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await main();
}
