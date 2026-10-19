import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { userInfo } from "node:os";
import { dirname, join } from "node:path";

import type { User } from "./model";
import { createDogear } from "./server/handler";
import { fileStore } from "./server/store";

/**
 * `dogear serve`: the REST contract (`docs/contract.md`) on your machine, over a JSON file, for local
 * development with a coding agent. The page points at it
 * (`<dogear-comments endpoint="http://127.0.0.1:4848/api/comments">`) and `dogear mcp` reads it.
 *
 * Local only, on purpose: it listens on 127.0.0.1, answers only requests addressed to 127.0.0.1 or
 * localhost (so another site can't reach it through DNS rebinding), lets only development origins
 * call it from a browser, and caps request bodies. The browser is you; the agent proves it is the
 * agent with a token written to `.dogear/token` on start, which only processes on this machine can
 * read.
 */
export type ServeOptions = {
  /** Where comments live. Default `.dogear/comments.json` in the working directory. */
  file?: string;
  /** Default 4848; 0 picks a free port. */
  port?: number;
  /** The name your comments are signed with. Default: your OS user name. */
  name?: string;
  /**
   * Start signed out, as a first-time visitor to a public page does: `GET /me` is 401 until the
   * page sends `POST /me { name, tint }` (an `httpAdapter` with `guests: true`), which signs you in
   * under that name and avatar until the server stops.
   */
  guest?: boolean;
  /** Extra browser origins allowed besides localhost, 127.0.0.1, *.localhost and *.test. */
  origins?: string[];
  /** The agent's token. Default: a fresh random one, written next to `file` as `token`. */
  token?: string;
};

export type Served = { url: string; endpoint: string; token: string; close(): Promise<void> };

export const DEFAULT_PORT = 4848;
const API = "/api/comments";
const MAX_BODY_BYTES = 64 * 1024;

/** Hosts a development page is served from. */
function devOrigin(origin: string, extra: string[]) {
  if (extra.includes(origin)) return true;
  try {
    const { hostname, protocol } = new URL(origin);
    return (
      (protocol === "http:" || protocol === "https:") &&
      (hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "[::1]" ||
        hostname.endsWith(".localhost") ||
        hostname.endsWith(".test"))
    );
  } catch {
    return false;
  }
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The request's body, capped: a Fetch body for `createDogear`. */
async function readBody(request: IncomingMessage): Promise<Buffer> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "body too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * Where `dogear serve` keeps its file and token: `.dogear/` in the working directory, or `.inkd/`
 * when that's all there is (comments kept from before the rename to Dogear).
 */
export function dataDir(cwd = process.cwd()) {
  const dir = join(cwd, ".dogear");
  const old = join(cwd, ".inkd");
  return !existsSync(dir) && existsSync(old) ? old : dir;
}

export async function serve(options: ServeOptions = {}): Promise<Served> {
  const file = options.file ?? join(dataDir(), "comments.json");
  const port = options.port ?? DEFAULT_PORT;
  const origins = options.origins ?? [];
  let you: User | null = options.guest ? null : { id: "local", name: options.name ?? osUser() };
  const token = options.token ?? randomBytes(24).toString("base64url");

  await mkdir(dirname(file), { recursive: true });
  if (!options.token) {
    await writeFile(join(dirname(file), "token"), token, { mode: 0o600 });
  }

  // The contract itself is `createDogear`'s, over the JSON file. There's one person, you (none yet
  // with `guest`, until the page joins), and the agent with the token.
  const dogear = createDogear({
    store: fileStore(file),
    basePath: API,
    agentToken: token,
    auth: () => you,
    join: async (_request, name, tint) => (you ??= { id: "local", name, ...(tint ? { tint } : {}) }),
    onError: (error) => console.error("dogear serve:", error),
  });

  async function handle(request: IncomingMessage, response: ServerResponse, actualPort: number) {
    // DNS rebinding: a page on evil.example that resolves to 127.0.0.1 still sends its own Host.
    const host = request.headers.host ?? "";
    if (host !== `127.0.0.1:${actualPort}` && host !== `localhost:${actualPort}`) {
      throw new HttpError(403, "wrong host");
    }
    const origin = request.headers.origin;
    if (origin !== undefined) {
      if (!devOrigin(origin, origins)) throw new HttpError(403, `origin ${origin} not allowed`);
      response.setHeader("access-control-allow-origin", origin);
      response.setHeader("access-control-allow-credentials", "true");
      response.setHeader("vary", "origin");
    }
    if (request.method === "OPTIONS") {
      response.setHeader("access-control-allow-methods", "GET, POST, PATCH, DELETE");
      response.setHeader("access-control-allow-headers", "content-type, authorization");
      response.writeHead(204).end();
      return;
    }
    const url = new URL(request.url ?? "/", `http://${host}`);
    if (url.pathname === "/health") return send(response, 200, { ok: true });

    const method = request.method ?? "GET";
    const body = method === "GET" || method === "HEAD" ? undefined : new Uint8Array(await readBody(request));
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (typeof value === "string") headers.set(key, value);
    }
    const answer = await dogear(new Request(url, { method, headers, body }));
    response.writeHead(answer.status, Object.fromEntries(answer.headers));
    response.end(Buffer.from(await answer.arrayBuffer()));
  }

  const server = createServer((request, response) => {
    const actualPort = (server.address() as { port: number }).port;
    handle(request, response, actualPort).catch((error: unknown) => {
      const status = error instanceof HttpError ? error.status : 500;
      if (status === 500) console.error("dogear serve:", error);
      send(response, status, { error: error instanceof Error ? error.message : "error" });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return {
    url,
    endpoint: url + API,
    token,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** Your OS user name, or "You" where there isn't one (some containers). */
function osUser() {
  try {
    return userInfo().username || "You";
  } catch {
    return "You";
  }
}

function send(response: ServerResponse, status: number, body: unknown) {
  if (response.headersSent) return;
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
