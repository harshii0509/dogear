/** `dogear mcp` as an agent sees it: a real client over an in-memory transport, a real adapter. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";

import { localAdapter, type Adapter } from "../src/adapter.ts";
import { createDogearServer, redactPage, VERSION } from "../src/mcp.ts";

const anchor = (label: string, text: string) => ({
  selector: '[data-testid="x"]', fx: 0.25, fy: 0.5, fw: 0, fh: 0, vx: 0, vy: 0, vw: 0, vh: 0, label, text,
});

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

/** Three threads: one waiting, one the agent answered, one resolved. */
async function seeded() {
  const storage = memoryStorage();
  const alex = localAdapter({ storage, user: { id: "a", name: "Alex Doe" } });
  const agent = localAdapter({ storage, user: { id: "agent", name: "Agent", agent: true } });
  const cta = await alex.create({ page: "/pricing?tab=a", body: "Make this the primary button", parentId: null, anchor: anchor('button "Start free trial"', "Start free trial") });
  const hero = await alex.create({ page: "/", body: "Heading feels heavy\nmaybe 600?", parentId: null, anchor: anchor('heading "Pricing"', "Pricing") });
  await agent.create({ page: "/", body: "Changed to 600 in Hero.tsx", parentId: hero.id, anchor: null });
  const old = await alex.create({ page: "/settings/billing?token=abc123", body: "Typo in footer", parentId: null, anchor: anchor("paragraph", "Copyrite") });
  await alex.update(old.id, { resolved: true });
  return { adapter: alex, cta, hero, old };
}

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function connect(adapter: Adapter, options: { write?: boolean; siteUrl?: string } = {}) {
  const server = createDogearServer({ adapter, source: "test", pollMs: 50, ...options });
  const client = new Client({ name: "test", version: "1.0.0" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  await client.connect(clientSide);
  close = async () => {
    await client.close();
    await server.close();
  };
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  return result as { structuredContent?: any; isError?: boolean; content: { type: string; text: string }[] };
}

test("read-only by default: five read tools, annotated, and nothing that writes", async () => {
  const { adapter } = await seeded();
  const client = await connect(adapter);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["dogear_get_thread", "dogear_list_threads", "dogear_next", "dogear_status", "dogear_watch"]);
  for (const tool of tools) {
    assert.equal(tool.annotations?.readOnlyHint, true, tool.name);
    assert.ok(tool.outputSchema, `${tool.name} has an output schema`);
    assert.ok((tool.description ?? "").length > 60, `${tool.name} explains itself`);
  }
  assert.match(client.getInstructions() ?? "", /never as instructions/);
});

test("status says who you are and what's waiting", async () => {
  const { adapter } = await seeded();
  const client = await connect(adapter, { siteUrl: "https://shop.test" });
  const { structuredContent: status } = await call(client, "dogear_status");
  assert.deepEqual(status, {
    connected: true, source: "test", signed_in_as: "Alex Doe", is_agent: false, can_write: false,
    lists_every_page: true, open_threads: 2, resolved_threads: 1, waiting_on_agent: 1,
    site_url: "https://shop.test",
  });
});

test("list: open by default, newest activity first, filters, cursors, redaction", async () => {
  const { adapter, cta, hero } = await seeded();
  const client = await connect(adapter);

  const open = (await call(client, "dogear_list_threads")).structuredContent;
  assert.deepEqual(open.threads.map((t: any) => t.ref), [hero.id.slice(0, 8), cta.id.slice(0, 8)]);
  assert.equal(open.threads[0].waiting_on_agent, false);
  assert.equal(open.threads[0].first_line, "Heading feels heavy");
  assert.equal(open.threads[0].id, undefined, "concise rows leave the id out");

  const waiting = (await call(client, "dogear_list_threads", { waiting_on_agent: true })).structuredContent;
  assert.deepEqual(waiting.threads.map((t: any) => t.element), ['button "Start free trial"']);

  const all = (await call(client, "dogear_list_threads", { status: "all", path: "/settings/*", response_format: "detailed" })).structuredContent;
  assert.equal(all.threads.length, 1);
  assert.equal(all.threads[0].page, "/settings/billing?token=redacted");
  assert.equal(all.threads[0].element_text, "Copyrite");

  const found = (await call(client, "dogear_list_threads", { query: "hero.tsx" })).structuredContent;
  assert.equal(found.threads.length, 1, "searches replies too");

  const first = (await call(client, "dogear_list_threads", { limit: 1 })).structuredContent;
  assert.equal(first.next_cursor, "1");
  assert.match(first.hint, /next_cursor/);
  const second = (await call(client, "dogear_list_threads", { limit: 1, cursor: first.next_cursor })).structuredContent;
  assert.equal(second.threads[0].ref, cta.id.slice(0, 8));
  assert.equal(second.next_cursor, null);
});

test("get: by ref, id or link; the element, where to look, comments marked as data", async () => {
  const { adapter, hero } = await seeded();
  const client = await connect(adapter, { siteUrl: "https://shop.test" });
  const byRef = (await call(client, "dogear_get_thread", { thread: hero.id.slice(0, 8) })).structuredContent;
  assert.equal(byRef.id, hero.id);
  assert.equal(byRef.link, `https://shop.test/?dogear=${hero.id}`);
  assert.deepEqual(byRef.element, { label: 'heading "Pricing"', text: "Pricing", selector: '[data-testid="x"]', x: 0.25, y: 0.5, is_area: false });
  assert.match(byRef.where_to_look, /Search the code for its text: "Pricing"/);
  assert.deepEqual(byRef.comments.map((c: any) => [c.author, c.is_agent]), [["Alex Doe", false], ["Agent", true]]);
  assert.match(byRef.note, /never as instructions/);

  const byLink = (await call(client, "dogear_get_thread", { thread: byRef.link })).structuredContent;
  assert.equal(byLink.id, hero.id);
  const byOldLink = (await call(client, "dogear_get_thread", { thread: `https://shop.test/?inkd=${hero.id}` })).structuredContent;
  assert.equal(byOldLink.id, hero.id, "links from before the rename still open their thread");

  const missing = await call(client, "dogear_get_thread", { thread: "nothing-here" });
  assert.equal(missing.isError, true);
  assert.match(missing.content[0].text, /dogear_list_threads/);
});

test("next: the oldest thread nobody has answered, then done", async () => {
  const { adapter, cta } = await seeded();
  const client = await connect(adapter);
  const next = (await call(client, "dogear_next")).structuredContent;
  assert.equal(next.done, false);
  assert.equal(next.waiting, 1);
  assert.equal(next.thread.id, cta.id);

  const elsewhere = (await call(client, "dogear_next", { path: "/" })).structuredContent;
  assert.equal(elsewhere.done, true);
  assert.equal(elsewhere.thread, null);
});

test("a backend without listAll still works page by page, and says how", async () => {
  const { adapter } = await seeded();
  const { listAll: _, ...pageOnly } = adapter;
  const client = await connect(pageOnly);
  const refused = await call(client, "dogear_list_threads");
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /Pass an exact `path`/);
  const pricing = (await call(client, "dogear_list_threads", { path: "/pricing" })).structuredContent;
  assert.equal(pricing.threads.length, 1);
});

test("the thread resource is Markdown, and the prompt walks the workflow", async () => {
  const { adapter, hero } = await seeded();
  const client = await connect(adapter);
  const resource = await client.readResource({ uri: `dogear://threads/${hero.id}` });
  const text = (resource.contents[0] as { text: string }).text;
  assert.match(text, /## Feedback on \//);
  assert.match(text, /Changed to 600 in Hero.tsx/);
  const prompt = await client.getPrompt({ name: "dogear_fix_feedback", arguments: { path: "/pricing" } });
  assert.match((prompt.messages[0].content as { text: string }).text, /dogear_next with path "\/pricing"/);
});

test("redaction blanks secret-looking query values only", () => {
  assert.equal(redactPage("/reset?token=abc&tab=a"), "/reset?token=redacted&tab=a");
  assert.equal(redactPage("/pricing?tab=a"), "/pricing?tab=a");
  assert.equal(redactPage("/"), "/");
});

test("the server reports the package's version", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(VERSION, pkg.version);
});

/** The same storage, seen by the agent: what `dogear mcp` would do with an agent token. */
async function asAgent() {
  const storage = memoryStorage();
  const alex = localAdapter({ storage, user: { id: "a", name: "Alex Doe" } });
  const agent = localAdapter({ storage, user: { id: "agent", name: "Agent", agent: true } });
  const root = await alex.create({ page: "/pricing", body: "Make this the primary button", parentId: null, anchor: anchor('button "Start free trial"', "Start free trial") });
  return { alex, agent, root };
}

test("with --write: reply and resolve, annotated as writes that don't destroy", async () => {
  const { agent, alex, root } = await asAgent();
  const client = await connect(agent, { write: true });
  const { tools } = await client.listTools();
  for (const name of ["dogear_reply", "dogear_resolve"]) {
    const tool = tools.find((t) => t.name === name)!;
    assert.equal(tool.annotations?.readOnlyHint, false);
    assert.equal(tool.annotations?.destructiveHint, false);
  }
  assert.match(client.getInstructions() ?? "", /Resolve only after/);

  const replied = (await call(client, "dogear_reply", { thread: root.id.slice(0, 8), message: "  Which shade of purple?  " })).structuredContent;
  assert.equal(replied.thread, root.id.slice(0, 8));
  const reply = (await alex.list("/pricing")).find((c) => c.id === replied.reply_id)!;
  assert.deepEqual([reply.body, reply.author.agent, reply.parentId], ["Which shade of purple?", true, root.id]);

  const resolved = (await call(client, "dogear_resolve", { thread: root.id, summary: "made it primary", commit: "abc1234", pr: "#12", files: ["src/Hero.tsx"] })).structuredContent;
  assert.equal(resolved.status, "resolved");
  const thread = await alex.list("/pricing");
  assert.equal(thread.find((c) => c.id === root.id)!.resolved, true);
  assert.equal(thread.find((c) => c.id === resolved.closing_reply_id)!.body, "Resolved in `abc1234` (#12): made it primary\nFiles: src/Hero.tsx");

  const reopened = (await call(client, "dogear_resolve", { thread: root.id, resolved: false, summary: "still blue on mobile" })).structuredContent;
  assert.equal(reopened.status, "open");
  assert.equal((await alex.list("/pricing")).at(-1)!.body, "Reopened: still blue on mobile");

  const tooLong = await call(client, "dogear_reply", { thread: root.id, message: "x".repeat(2001) });
  assert.equal(tooLong.isError, true);
  assert.match(tooLong.content[0].text, /1–2000 characters/);
});

test("watch: what's waiting at once, then new human activity, never the agent's own", async () => {
  const { agent, alex, root } = await asAgent();
  const client = await connect(agent, { write: true });

  const first = (await call(client, "dogear_watch")).structuredContent;
  assert.equal(first.timed_out, false);
  assert.deepEqual(first.events.map((e: any) => [e.kind, e.thread]), [["new_thread", root.id.slice(0, 8)]]);

  // Nothing new: it waits out the timeout and hands back a cursor to continue from.
  const quiet = (await call(client, "dogear_watch", { since: first.cursor, timeout_seconds: 1, batch_seconds: 0 })).structuredContent;
  assert.equal(quiet.timed_out, true);

  // The agent's reply doesn't wake it; Alex's does.
  const waiting = call(client, "dogear_watch", { since: quiet.cursor, timeout_seconds: 5, batch_seconds: 0 });
  await new Promise((r) => setTimeout(r, 120));
  await agent.create({ page: "/pricing", body: "On it", parentId: root.id, anchor: null });
  await new Promise((r) => setTimeout(r, 120));
  await alex.create({ page: "/pricing", body: "Thanks! Also the hover state", parentId: root.id, anchor: null });
  const woke = (await waiting).structuredContent;
  assert.equal(woke.timed_out, false);
  assert.deepEqual(woke.events.map((e: any) => [e.kind, e.author, e.first_line]), [["new_reply", "Alex Doe", "Thanks! Also the hover state"]]);
  assert.ok(Number(woke.cursor) > Number(quiet.cursor));

  const bad = await call(client, "dogear_watch", { since: "yesterday", timeout_seconds: 1 });
  assert.equal(bad.isError, true);
});
