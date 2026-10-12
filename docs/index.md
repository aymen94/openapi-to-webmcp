---
title: OpenAPI to WebMCP
---

Generate browser-side [WebMCP](https://github.com/webmachinelearning/webmcp) tools from an OpenAPI 3.0 or 3.1 document.

## Quick start

Requires Node.js 20 or newer.

```sh
npm install --save-dev openapi-to-webmcp
npx openapi-to-webmcp openapi.yaml
npx openapi-to-webmcp openapi.yaml --typescript
```

The default output is `webmcp.js`. Use `--output src/webmcp.ts` to choose another file. Run `npx openapi-to-webmcp --help` for all options.

## Use the generated module

Import the generated ES module in your browser application and register its tools:

```js
import { createWebMCPTools } from './webmcp.js';

const { tools, register } = createWebMCPTools({
  auth: { type: 'bearer', token: getTokenAtRuntime() },
});

await register(); // registers with document.modelContext
```

The module makes API calls with Fetch. The API server must permit your page through CORS. Pass credentials at runtime; generated files never contain secrets.

## Browser library via CDN

The browser library generates the browser-side WebMCP module from the
normalized API object returned by `parseOpenAPI`. Parse the source document in
your build step because the YAML parser is Node-oriented.

```js
import { generateCode } from
  'https://cdn.jsdelivr.net/npm/openapi-to-webmcp@1.0.0/dist/browser.js';

const api = await fetch('/normalized-openapi.json').then((response) => response.json());
const generatedModule = generateCode(api);
```

The generated module's `register()` uses `document.modelContext.registerTool`,
so registration requires a browser that implements the [WebMCP API](https://github.com/webmachinelearning/webmcp).
The package CDN artifact is built by `npm run build:browser` and automatically
before `npm pack`.

## More

- [Developer guide]({% link development.md %}) for local setup, architecture, and project commands.
- [Full README](https://github.com/aymen94/openapi-to-webmcp#readme) for CLI options, supported schemas, authentication, and limitations.
