import { defineConfig } from "tsup";

export default defineConfig([
  // The core: types, adapters and `validateNew`, safe to import on a server.
  { entry: { index: "src/index.ts" }, format: ["esm"], dts: true, clean: true },
  // The React component, React being the host app's. Built on its own so the "use client"
  // directive Next needs stays off the core, which a route handler imports.
  {
    entry: { react: "src/react.ts" },
    format: ["esm"],
    dts: true,
    external: ["react", "react-dom"],
    banner: { js: '"use client";' },
  },
  // The server half (`@harshi04/dogear/server`): createDogear and its stores, Node only.
  {
    entry: { server: "src/server/index.ts" },
    format: ["esm"],
    dts: true,
    platform: "node",
    target: "node20",
  },
  // The command line (`dogear serve`, `dogear mcp`): Node only, and never part of a browser bundle.
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    platform: "node",
    target: "node20",
    banner: { js: "#!/usr/bin/env node" },
  },
  // The custom element: the same component on Preact, so a plain page needs nothing else.
  {
    entry: { element: "src/element.ts" },
    format: ["esm", "iife"],
    globalName: "Dogear",
    dts: true,
    minify: true,
    noExternal: [/.*/],
    esbuildOptions(options) {
      options.alias = {
        react: "preact/compat",
        "react-dom": "preact/compat",
        "react/jsx-runtime": "preact/jsx-runtime",
      };
    },
  },
]);
