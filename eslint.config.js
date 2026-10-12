export default [
  {
    files: ["src/**/*.js", "test/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        btoa: "readonly",
        console: "readonly",
        fetch: "readonly",
        globalThis: "readonly",
        Headers: "readonly",
        process: "readonly",
        URL: "readonly",
      },
    },
    rules: {
      "no-constant-condition": "error",
      "no-dupe-keys": "error",
      "no-unreachable": "error",
      "no-unused-vars": ["error", { args: "none" }],
    },
  },
];
