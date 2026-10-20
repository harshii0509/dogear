/** `dogear serve` keeps the REST contract, and stays local: wrong host, foreign origin, huge body. */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { httpAdapter } from "../src/adapter.ts";
import { dataDir, serve, type Served } from "../src/serve.ts";

const anchor = { selector: "body", fx: 0, fy: 0, fw: 0, fh: 0, vx: 0, vy: 0, vw: 0, vh: 0 };
let dir: string;
let served: Served;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "dogear-serve-"));
  served = await serve({ port: 0, file: join(dir, "comments.json"), name: "Alex" });
});
after(async () => {
  await served.close();
  await rm(dir, { recursive: true, force: true });
});

/** A raw request, for headers `fetch` won't let us set (Host). */
function raw(path: string, headers: Record<string, string>, method = "GET", body?: string) {
  const { port } = new URL(served.url);
  return new Promise<{ status: number; headers: Record<string, unknown>; body: string }>(
    (resolve, reject) => {
      const req = httpRequest({ host: "127.0.0.1", port, path, method, headers }, (res) => {
        let text = "";
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body: text }));
      });
      req.on("error", reject);
      req.end(body);
    },
  );
}

test("the contract, with you in the browser and the agent by token", async () => {
  const you = httpAdapter(served.endpoint);
  const agent = httpAdapter(served.endpoint, { token: served.token });
  assert.equal((await you.me())?.name, "Alex");
  assert.deepEqual(await agent.me(), { id: "agent", name: "Agent", agent: true });
  // A page with guests on asks to join; locally there is one person, already in.
  assert.equal((await httpAdapter(served.endpoint, { guests: true }).join!("Someone")).name, "Alex");

  const root = await you.create({ page: "/pricing?tab=a", body: "Too small", parentId: null, anchor });
  const reply = await agent.create({ page: "/pricing", body: "Fixed in Hero.tsx", parentId: root.id, anchor: null });
  assert.equal(reply.author.agent, true);
  assert.deepEqual((await you.list("/pricing")).map((c) => c.id), [root.id, reply.id]);
  assert.equal((await agent.listAll!()).length, 2);

  await assert.rejects(agent.update(root.id, { body: "rewritten" }), /403/);
  assert.equal((await agent.update(root.id, { resolved: true })).resolved, true);
  await assert.rejects(agent.remove(reply.id), /403/);
  // A wrong token is refused outright, not quietly treated as the browser user.
  await assert.rejects(httpAdapter(served.endpoint, { token: "guess" }).remove(reply.id), /401/);
  assert.equal(await httpAdapter(served.endpoint, { token: "guess" }).me(), null);

  // Kept on disk, so a restart (or another process) sees the same threads.
  const saved = JSON.parse(await readFile(join(dir, "comments.json"), "utf8"));
  assert.deepEqual(saved.map((c: { id: string }) => c.id), [root.id, reply.id]);
  assert.deepEqual(await you.remove(root.id), [root.id, reply.id]);
});

test("only requests addressed to this machine get in", async () => {
  const { port } = new URL(served.url);
  assert.equal((await raw("/health", { host: `127.0.0.1:${port}` })).status, 200);
  assert.equal((await raw("/health", { host: `localhost:${port}` })).status, 200);
  assert.equal((await raw("/health", { host: "evil.example" })).status, 403);
});

test("development origins only, with credentials", async () => {
  const { port } = new URL(served.url);
  const host = `127.0.0.1:${port}`;
  const ok = await raw("/api/comments/me", { host, origin: "http://localhost:3000" });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers["access-control-allow-origin"], "http://localhost:3000");
  assert.equal(ok.headers["access-control-allow-credentials"], "true");
  assert.equal((await raw("/api/comments/me", { host, origin: "http://shop.test" })).status, 200);
  assert.equal((await raw("/api/comments/me", { host, origin: "https://evil.example" })).status, 403);
  const preflight = await raw("/api/comments", { host, origin: "http://localhost:5173" }, "OPTIONS");
  assert.equal(preflight.status, 204);
});

test("bodies are capped and validated", async () => {
  const { port } = new URL(served.url);
  const host = `127.0.0.1:${port}`;
  const json = { host, "content-type": "application/json" };
  const huge = JSON.stringify({ page: "/", body: "x".repeat(70_000), parentId: null, anchor });
  assert.equal((await raw("/api/comments", json, "POST", huge)).status, 413);
  assert.equal((await raw("/api/comments", json, "POST", "{nope")).status, 400);
  assert.equal((await raw("/api/comments", json, "POST", JSON.stringify({ page: "x" }))).status, 400);
  assert.equal((await raw("/api/comments/missing", json, "PATCH", "{}")).status, 404);
});

test("--guest starts signed out, and joining signs you in with your avatar", async () => {
  const guestDir = await mkdtemp(join(tmpdir(), "dogear-serve-guest-"));
  const guest = await serve({ port: 0, file: join(guestDir, "comments.json"), guest: true });
  try {
    const page = httpAdapter(guest.endpoint, { guests: true });
    assert.equal(await page.me(), null);
    assert.deepEqual(await page.list("/"), []);
    await assert.rejects(page.create({ page: "/", body: "hi", parentId: null, anchor }), /401/);
    await assert.rejects(page.join!("   "), /400/);
    assert.deepEqual(await page.join!("Riley S", "url(x)"), { id: "local", name: "Riley S" });
    const me = await page.join!("Riley S", "sage");
    assert.deepEqual(me, { id: "local", name: "Riley S" }, "already in: joining again changes nothing");
    assert.equal((await page.create({ page: "/", body: "hi", parentId: null, anchor })).author.name, "Riley S");
  } finally {
    await guest.close();
    await rm(guestDir, { recursive: true, force: true });
  }
  const fresh = await mkdtemp(join(tmpdir(), "dogear-serve-guest-"));
  const second = await serve({ port: 0, file: join(fresh, "comments.json"), guest: true });
  try {
    assert.equal((await httpAdapter(second.endpoint, { guests: true }).join!("Sam", "sky")).tint, "sky");
  } finally {
    await second.close();
    await rm(fresh, { recursive: true, force: true });
  }
});

test("reactions toggle per person through POST /:id/reactions", async () => {
  const you = httpAdapter(served.endpoint);
  const agent = httpAdapter(served.endpoint, { token: served.token });
  const root = await you.create({ page: "/react", body: "Nice", parentId: null, anchor });
  assert.deepEqual((await you.react!(root.id, "🔥")).reactions, { "🔥": ["local"] });
  assert.deepEqual((await agent.react!(root.id, "🔥")).reactions, { "🔥": ["local", "agent"] });
  // Again takes yours back; the agent's stays.
  assert.deepEqual((await you.react!(root.id, "🔥")).reactions, { "🔥": ["agent"] });
  assert.deepEqual((await you.list("/react"))[0].reactions, { "🔥": ["agent"] });
  await assert.rejects(you.react!(root.id, "lol"), /400/);
  await assert.rejects(you.react!(root.id, "🔥🔥"), /400/);
  for (let i = 0; i < 19; i++) await you.react!(root.id, String.fromCodePoint(0x1f600 + i));
  await assert.rejects(you.react!(root.id, "🚀"), /422/);
  await assert.rejects(you.react!("nope", "🔥"), /404/);
});

test("comments kept in .inkd/ from before the rename are still found", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "dogear-dir-"));
  try {
    assert.equal(dataDir(cwd), join(cwd, ".dogear"), "a fresh directory gets .dogear/");
    await mkdir(join(cwd, ".inkd"));
    assert.equal(dataDir(cwd), join(cwd, ".inkd"), "only .inkd/: keep using it");
    await mkdir(join(cwd, ".dogear"));
    assert.equal(dataDir(cwd), join(cwd, ".dogear"), "both: .dogear/ wins");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
