import { readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { httpAdapter, type Adapter } from "./adapter";
import { DEFAULT_PORT, dataDir, serve } from "./serve";

const HELP = `dogear: comments on live pages, for people and coding agents

Usage
  dogear serve [--port 4848] [--file .dogear/comments.json] [--name "Asha" | --guest] [--origin <url>]...
      A local comments server for development. --guest starts signed out, so the page asks for
      a name (and avatar) as it would a first-time visitor. Point the page at the endpoint:
      <dogear-comments endpoint="http://127.0.0.1:4848/api/comments">

  dogear mcp [--endpoint <url> | --adapter <file>] [--token <t>] [--site <url>] [--write]
      An MCP server (stdio) that lets a coding agent read the threads, and with --write, reply
      and resolve. Where it reads from:
        (nothing)          the local \`dogear serve\` in this directory (token from .dogear/token)
        --endpoint <url>   your REST route; the token from --token or DOGEAR_TOKEN
        --adapter <file>   a module whose default export is an Adapter
      --site <url> (or DOGEAR_SITE_URL) makes links that open a thread on its page.
      --write (or DOGEAR_MCP_WRITE=1) adds dogear_reply and dogear_resolve.

  dogear help
`;

/** `DOGEAR_<name>`, or `INKD_<name>` as it was called before the rename. */
const env = (name: string) => process.env[`DOGEAR_${name}`] || process.env[`INKD_${name}`];

/** Where `dogear mcp` reads from, and how to say so. */
async function adapterFor(values: {
  endpoint?: string;
  adapter?: string;
  token?: string;
  port?: string;
}): Promise<{ adapter: Adapter; source: string }> {
  if (values.adapter) {
    const file = resolve(values.adapter);
    const module = (await import(pathToFileURL(file).href)) as { default?: Adapter; adapter?: Adapter };
    const adapter = module.default ?? module.adapter;
    if (!adapter || typeof adapter.list !== "function") {
      throw new Error(`${values.adapter} must export an Adapter as its default export (or as "adapter")`);
    }
    return { adapter, source: `adapter module ${values.adapter}` };
  }
  // An empty or unexpanded DOGEAR_TOKEN ("${DOGEAR_TOKEN}" in a config, the variable unset) means none.
  const given = values.token || env("TOKEN");
  const token = given && !/^\$\{.*\}$/.test(given) ? given : undefined;
  if (values.endpoint) {
    return { adapter: httpAdapter(values.endpoint, { token }), source: `endpoint ${values.endpoint}` };
  }
  // The local server, started in this directory: it wrote its token next to the comments.
  const endpoint = `http://127.0.0.1:${values.port ?? DEFAULT_PORT}/api/comments`;
  const local = await readFile(join(dataDir(), "token"), "utf8").catch(() => null);
  if (!local && !token) {
    console.error(
      "dogear mcp: no .dogear/token here. Run `npx dogear serve` in this directory first, " +
        "or pass --endpoint (or --adapter).",
    );
  }
  return {
    adapter: httpAdapter(endpoint, { token: token ?? local?.trim() }),
    source: `dogear serve at ${endpoint}`,
  };
}

async function main(argv: string[]) {
  const [command = "help", ...rest] = argv;
  if (command === "serve") {
    const { values } = parseArgs({
      args: rest,
      options: {
        port: { type: "string" },
        file: { type: "string" },
        name: { type: "string" },
        guest: { type: "boolean" },
        origin: { type: "string", multiple: true },
      },
    });
    const port = values.port === undefined ? DEFAULT_PORT : Number(values.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new Error(`--port must be a port number, not "${values.port}"`);
    }
    const served = await serve({
      port,
      file: values.file,
      name: values.name,
      guest: values.guest,
      origins: values.origin,
    });
    console.log(`dogear serve: ${served.endpoint}

Point your page at it:
  <dogear-comments endpoint="${served.endpoint}"></dogear-comments>
  <Comments adapter={httpAdapter("${served.endpoint}")} />

Comments are kept in ${values.file ?? join(relative(process.cwd(), dataDir()), "comments.json")}. Add ${relative(process.cwd(), dataDir())}/ to .gitignore.`);
    const stop = () => void served.close().then(() => process.exit(0));
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    return;
  }
  if (command === "mcp") {
    const { values } = parseArgs({
      args: rest,
      options: {
        endpoint: { type: "string" },
        adapter: { type: "string" },
        token: { type: "string" },
        port: { type: "string" },
        site: { type: "string" },
        write: { type: "boolean" },
      },
    });
    const { adapter, source } = await adapterFor(values);
    // Only the protocol goes to stdout; everything else to stderr.
    const { createDogearServer } = await import("./mcp");
    const { StdioServerTransport } = await import("@modelcontextprotocol/server/stdio");
    const server = createDogearServer({
      adapter,
      source,
      siteUrl: values.site ?? env("SITE_URL"),
      write: values.write ?? env("MCP_WRITE") === "1",
    });
    await server.connect(new StdioServerTransport());
    console.error(`dogear mcp: reading ${source}`);
    return;
  }
  if (command === "help" || command === "--help" || command === "-h") {
    console.log(HELP);
    return;
  }
  throw new Error(`unknown command "${command}"\n\n${HELP}`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(`dogear: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
