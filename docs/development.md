---
title: Developer guide
---

# Developer guide

## Set up

```sh
git clone https://github.com/aymen94/openapi-to-webmcp.git
cd openapi-to-webmcp
npm install
```

Use Node.js 20 or newer. Generate from the included sample with:

```sh
npx openapi-to-webmcp examples/openapi.yaml --output webmcp.js
```

## Project layout

- `src/cli.js` parses command-line options and writes generated files.
- `src/parser.js` reads JSON/YAML and turns supported OpenAPI operations into an internal representation.
- `src/validator.js` checks the OpenAPI version and document structure and resolves local JSON Pointer references.
- `src/generator.js` emits the JavaScript or TypeScript WebMCP module.
- `test/` contains parser, generator, CLI, and TypeScript checks.
- `examples/` contains a small OpenAPI document for manual use.

The generator emits tools for `document.modelContext.registerTool()`. Tool handlers use Fetch for network requests; WebMCP itself does not make those requests.

## Common commands

```sh
npm test          # run automated tests
npm run lint      # lint source and tests
npm run typecheck # check generated TypeScript
npm run pack:check # inspect the npm package contents
```

## Making a change

Keep parsing, validation, CLI handling, and code generation in their existing modules. Add a focused test for new behavior, run the relevant commands above, and update the README when a CLI option or supported input changes.

OpenAPI input is data: do not execute examples, vendor extensions, or other content from a specification. Keep runtime credentials out of generated code. Report unsupported operations clearly rather than emitting incomplete handlers.

## Publish preview

Before publishing, review package metadata and run `npm pack --dry-run`. The package publishes only the files listed by the `files` field in `package.json`.

To publish these pages with GitHub Pages, open the repository's **Settings → Pages**, choose **Deploy from a branch**, then select the default branch and the `/docs` folder.
