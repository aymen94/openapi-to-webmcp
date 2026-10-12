# openapi-to-webmcp

[GitHub repository](https://github.com/aymen94/openapi-to-webmcp) · [npm package](https://www.npmjs.com/package/openapi-to-webmcp)

Read the [developer docs](docs/index.md) for the GitHub Pages guide.

Generate browser-side [WebMCP](https://github.com/webmachinelearning/webmcp) tools from OpenAPI 3.0.x and 3.1.x documents. The CLI accepts JSON or YAML and emits a JavaScript ES module by default.

## Install and generate

Requires Node.js 20 or newer.

```sh
npm install --save-dev openapi-to-webmcp
npx openapi-to-webmcp openapi.yaml
npx openapi-to-webmcp -i openapi.json -o src/webmcp.ts --typescript
```

JSON (`.json`), YAML (`.yaml` / `.yml`), and standard input (`-i -`) are supported. Without `--output`, the CLI writes `webmcp.js` or `webmcp.ts` to the current directory. Existing output files are protected; pass `--force` to replace one. Parent directories are created as needed. Successful runs print the package and OpenAPI versions, API title, input and output paths, and output language.

```sh
npx openapi-to-webmcp --check openapi.yaml
cat openapi.yaml | npx openapi-to-webmcp -i - -o webmcp.js
```

## Options

| Option | Description |
| --- | --- |
| `-i, --input <file>` | Input JSON/YAML file, or `-` for standard input. A positional input path is also accepted. |
| `-o, --output <file>` | Output path; `.js` and `.ts` extensions select the matching language. |
| `--lang js\|ts` | Select output language. JavaScript is the default. |
| `-t, --typescript` | Shortcut for `--lang ts`. |
| `--base-url <url>` | Override the first OpenAPI server URL with an absolute HTTP(S) URL. |
| `--include <items>` | Include comma-separated tags, operation IDs, or generated tool names. |
| `--exclude <items>` | Exclude comma-separated tags, operation IDs, or generated tool names. |
| `--auth bearer\|api-key\|basic\|custom` | Require matching runtime credentials, or caller-supplied headers for `custom`; secrets are not generated into source. |
| `--check` | Parse and validate without writing output. |
| `--force` | Allow replacing an existing output file. |
| `--pretty` | Accepted for convenience; generated code is formatted by default. |
| `-h, --help` | Show CLI help. |
| `-V, --version` | Show package version. |
| `--debug` | Include a stack trace when a command fails. |

Conflicting language/output extensions and invalid option values are rejected. Usage errors exit with status 2; input, validation, and I/O failures exit with status 1.

## Use generated tools

```js
import { createWebMCPTools } from './webmcp.js';

const { tools, register } = createWebMCPTools({
  baseUrl: 'https://api.example.com',
  headers: { 'X-Client': 'my-app' },
  auth: { type: 'bearer', token: readTokenAtRuntime() },
});

await register(); // Uses document.modelContext.registerTool(tool)
```

You may instead pass a model context explicitly: `await register(document.modelContext)`. The returned tools can also be invoked directly with `tool.execute(args)`. Generated handlers send requests using Fetch, map path/query/header/cookie parameters and JSON request bodies, and return parsed JSON or plain text. Non-2xx responses reject with the HTTP status and response text.

Runtime authentication examples:

```js
{ type: 'bearer', token }
{ type: 'apiKey', in: 'header', name: 'X-API-Key', value }
{ type: 'apiKey', in: 'query', name: 'api_key', value }
{ type: 'basic', username, password }
```

Use `headers` for custom authentication. Supply secrets at runtime; do not put them in the OpenAPI document or generated module.

## Supported input and limitations

- OpenAPI 3.0.x and 3.1.x in JSON or YAML, including local JSON Pointer `$ref` references.
- Path, query, header, and cookie parameters; common primitive, enum, array, and object schemas; required fields; and JSON request bodies.
- Missing operation IDs are derived from method and path. Duplicate tool names receive deterministic numeric suffixes.
- Operations with unsupported parameter locations, circular/unresolved references, or Fetch-incompatible GET/HEAD bodies are rejected or skipped with warnings.
- External references, advanced parameter serialization styles, multipart/form-data, response validation, and remote `$ref` loading are not supported.
- Output is a browser ESM module using `fetch`, `Headers`, `URL`, and, for Basic authentication, `btoa`. TypeScript output requires DOM library types.
- Browser requests are subject to CORS and browser-controlled header restrictions (notably `Cookie`). Use only trusted API hosts; a server-side proxy may be needed for private APIs or restricted authentication flows.

## Troubleshooting

- **Could not parse input:** Check that the file is valid JSON or YAML and uses a supported extension. Parser-provided line and column information is shown when available.
- **Invalid OpenAPI document:** Review the named OpenAPI field or path in the error and validate the document against its declared OpenAPI version.
- **Output already exists:** Choose a different `--output` path or pass `--force` to replace it.
- **WebMCP or Fetch is unavailable:** Run the generated module in a browser that exposes `document.modelContext` and Fetch, or pass a compatible model context and `fetch` implementation.
- **Browser request fails:** Confirm the API permits the page origin via CORS and that authentication does not rely on browser-restricted headers.

## Library API

```js
import { parseOpenAPI, generateCode, validateOpenAPI } from 'openapi-to-webmcp';
```

### Browser library via CDN

The browser entry is an ES module for generating a browser-side WebMCP module
from the normalized API object returned by `parseOpenAPI`. Parse the source
specification as part of your build step; this browser entry does not bundle the
Node-oriented YAML parser.

```html
<script type="module">
  import { generateCode, validateOpenAPI } from
    'https://cdn.jsdelivr.net/npm/openapi-to-webmcp@1.0.0/dist/browser.js';

  // `api` is the normalized result produced by parseOpenAPI during your build.
  const api = await fetch('/normalized-openapi.json').then((response) => response.json());
  const generated = generateCode(api);
  console.log(generated); // Generated ESM uses fetch and document.modelContext
</script>
```

The browser module itself is published at
`https://cdn.jsdelivr.net/npm/openapi-to-webmcp@1.0.0/dist/browser.js` and can
also be imported with `import { generateCode } from 'openapi-to-webmcp/browser'`
in bundlers. Build it locally with `npm run build:browser`; `npm pack` builds it
automatically. The generated module registers tools through
`document.modelContext.registerTool`, available in browsers implementing the
[WebMCP API](https://github.com/webmachinelearning/webmcp). The browser
environment must provide Fetch, URL, Headers, and (for Basic auth) `btoa`.
