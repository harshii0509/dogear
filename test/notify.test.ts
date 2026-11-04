/** Connectors: the four events, webhooks against a fake fetch, and how the handler runs each one. */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

import type { Comment, User } from "../src/model.ts";
import { createDogear } from "../src/server/handler.ts";
import { headline, webhook, type DogearEvent, type Sender } from "../src/server/notify.ts";
import { memoryStore } from "../src/server/store.ts";

const anchor = { selector: "main", fx: 0, fy: 0, fw: 0, fh: 0, vx: 0, vy: 0, vw: 0, vh: 0 };
const comment: Comment = {
  id: "c1",
  page: "/settings?tab=keys",
  parentId: null,
  body: "@sam and @jordan.lee, is this key right?",
  author: { id: "alex@acme.test", name: "Alex Doe" },
  anchor,
  createdAt: 1,
  editedAt: null,
  resolved: false,
  mentions: [
    { id: "sam@acme.test", name: "Sam", handle: "sam" },
    { id: "jordan@acme.test", name: "Jordan Lee", handle: "jordan.lee" },
  ],
  state: { key: "form", data: { secret: "do not send" } },
};
const alex: User = { id: "alex@acme.test", name: "Alex Doe", email: "alex@acme.test" };
const event: DogearEvent = {
  type: "thread.created",
  actor: alex,
  page: "/settings",
  comment,
  thread: [comment],
  author: alex,
  mentioned: [
    { id: "sam@acme.test", name: "Sam", handle: "sam", email: "sam@acme.test" },
    { id: "jordan@acme.test", name: "Jordan Lee", handle: "jordan.lee", email: "jordan@acme.test" },
    { id: "guest-1", name: "No email", handle: "noemail" },
  ],
  link: "https://site.test/settings?tab=keys&comment=c1",
};

type Sent = { url: string; method: string; headers: Record<string, string>; body: unknown };
/** A fetch that records each request and answers from `reply`. */
function fake(reply: (sent: Sent, n: number) => Response | Promise<Response>) {
  const sent: Sent[] = [];
  const fetch = (async (url: string, init: RequestInit = {}) => {
    const item: Sent = {
      url: String(url),
      method: init.method ?? "GET",
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    };
    sent.push(item);
    return reply(item, sent.length);
  }) as typeof globalThis.fetch;
  return { fetch, sent };
}
test("webhook: a blip (a 5xx) is tried once more", async () => {
  let n = 0;
  const { fetch, sent } = fake(() => (n++ === 0 ? new Response("busy", { status: 503 }) : new Response(null, { status: 204 })));
  await webhook({ url: "https://hooks.test/in", fetch }).send(event);
  assert.equal(sent.length, 2, "sent again after a 503");
});

test("webhook: posts the event without forms, signed with the secret", async () => {
  const { fetch, sent } = fake(() => new Response(null, { status: 204 }));
  await webhook({ url: "https://hooks.test/in", secret: "shh", headers: { "x-team": "a" }, fetch }).send(event);
  const [request] = sent;
  assert.equal(request.method, "POST");
  assert.equal(request.headers["x-team"], "a");
  const body = request.body as Record<string, unknown> & { comment: Comment; thread: Comment[] };
  assert.equal(body.type, "thread.created");
  assert.equal(body.link, event.link);
  assert.equal(body.page, "/settings");
  assert.deepEqual(body.actor, { id: "alex@acme.test", name: "Alex Doe", email: "alex@acme.test" });
  assert.equal((body.mentioned as unknown[]).length, 3);
  assert.equal("state" in body.comment, false);
  assert.equal("state" in body.thread[0], false);
  const raw = JSON.stringify(body);
  assert.equal(request.headers["x-dogear-signature"], `sha256=${createHmac("sha256", "shh").update(raw).digest("hex")}`);

  const failing = fake(() => new Response("no", { status: 400 }));
  await assert.rejects(webhook({ url: "https://hooks.test/in", fetch: failing.fetch }).send(event), /400/);
  assert.equal(failing.sent.length, 1, "a 4xx isn't tried again");
  assert.equal("x-dogear-signature" in failing.sent[0].headers, false);
});

test("the handler runs every notifier and onCreated, each on its own", async () => {
  const people: Record<string, User> = {
    alex: { id: "alex@acme.test", name: "Alex Doe", email: "alex@acme.test", handle: "alex" },
    sam: { id: "sam@acme.test", name: "Sam", email: "sam@acme.test", handle: "sam" },
  };
  const deferred: (() => Promise<void>)[] = [];
  const heard: string[] = [];
  const errors: unknown[] = [];
  const dogear = createDogear({
    store: memoryStore(),
    auth: (request) => people[request.headers.get("x-user") ?? ""] ?? null,
    directory: { list: async () => Object.values(people).map(({ id, name, handle, email }) => ({ id, name, handle: handle!, email })) },
    defer: (task) => void deferred.push(task),
    onError: (error) => errors.push(error),
    onCreated: () => void heard.push("onCreated"),
    notify: [
      async (e) => void heard.push(`one:${e.mentioned.map((p) => p.email).join()}`),
      async () => {
        throw new Error("chat down");
      },
      async (e) => void heard.push(`three:${e.link}`),
    ],
  });
  const response = await dogear(
    new Request("https://site.test/api/comments", {
      method: "POST",
      headers: { "content-type": "application/json", "x-user": "alex" },
      body: JSON.stringify({ page: "/x", body: "@sam hi", parentId: null, anchor }),
    }),
  );
  assert.equal(response.status, 201);
  const { id } = (await response.json()) as Comment;
  assert.deepEqual(heard, [], "nothing before the response");
  await Promise.all(deferred.map((task) => task()));
  assert.deepEqual(heard.sort(), ["one:sam@acme.test", "onCreated", `three:https://site.test/x?dogear=${id}`].sort());
  assert.equal(errors.length, 1);
  assert.match(String(errors[0]), /chat down/);
});

test("headline: one plain line per event", () => {
  const resolved: DogearEvent = { type: "thread.resolved", actor: { id: "r", name: "Riley" }, comment, thread: [comment], page: "/pricing", link: "" };
  assert.equal(headline({ ...event, page: "/pricing" }), "Alex Doe started a thread on /pricing");
  assert.equal(headline({ ...event, type: "comment.replied", actor: { id: "s", name: "Sam" } }), "Sam replied on /settings");
  assert.equal(headline(resolved), "Riley resolved a thread on /pricing");
  assert.equal(headline({ ...resolved, type: "thread.reopened" }), "Riley reopened a thread on /pricing");
});

/** A handler with two people, whose deferred work runs when `settle()` is called. */
function site(notify: Parameters<typeof createDogear>[0]["notify"]) {
  const people: Record<string, User> = {
    alex: { id: "alex@acme.test", name: "Alex Doe", email: "alex@acme.test", handle: "alex" },
    sam: { id: "sam@acme.test", name: "Sam", email: "sam@acme.test", handle: "sam" },
  };
  const deferred: (() => Promise<void>)[] = [];
  const errors: unknown[] = [];
  const dogear = createDogear({
    store: memoryStore(),
    auth: (request) => people[request.headers.get("x-user") ?? ""] ?? null,
    defer: (task) => void deferred.push(task),
    onError: (error) => errors.push(error),
    notify,
  });
  const call = async (who: string, method: string, path: string, body: unknown) => {
    const response = await dogear(
      new Request(`https://site.test/api/comments${path}`, {
        method,
        headers: { "content-type": "application/json", "x-user": who },
        body: JSON.stringify(body),
      }),
    );
    return { status: response.status, comment: (await response.json()) as Comment };
  };
  const settle = async () => {
    while (deferred.length) await deferred.shift()!();
  };
  return { call, settle, errors };
}

test("the four events, each with who did it", async () => {
  const heard: DogearEvent[] = [];
  const all: Sender = {
    events: ["thread.created", "comment.replied", "thread.resolved", "thread.reopened"],
    send: async (e) => void heard.push(e),
  };
  const { call, settle } = site(all);
  const { comment: root } = await call("alex", "POST", "", { page: "/pricing?plan=pro", body: "Bigger?", parentId: null, anchor });
  await settle();
  await call("sam", "POST", "", { page: "/pricing?plan=pro", body: "On it", parentId: root.id, anchor: null });
  await settle();
  await call("sam", "PATCH", `/${root.id}`, { resolved: true });
  await settle();
  assert.equal(heard[2].comment.resolved, true);
  await call("sam", "PATCH", `/${root.id}`, { resolved: true });
  await call("alex", "PATCH", `/${root.id}`, { resolved: false });
  await settle();
  assert.deepEqual(
    heard.map((e) => [e.type, e.actor.name, e.thread.length]),
    [
      ["thread.created", "Alex Doe", 1],
      ["comment.replied", "Sam", 2],
      ["thread.resolved", "Sam", 2],
      ["thread.reopened", "Alex Doe", 2],
    ],
    "resolving twice tells once",
  );
  assert.ok(heard.every((e) => e.page === "/pricing" && e.link === `https://site.test/pricing?plan=pro&dogear=${root.id}`));
  assert.equal(heard[2].comment.id, root.id, "a resolve carries the thread's first comment");
});

test("by default a connector hears new threads and resolves; a function hears new comments", async () => {
  const objects: string[] = [];
  const functions: string[] = [];
  const { call, settle } = site([
    { send: async (e) => void objects.push(e.type) },
    async (e) => void functions.push(e.comment.body),
  ]);
  const { comment: root } = await call("alex", "POST", "", { page: "/x", body: "One", parentId: null, anchor });
  await call("sam", "POST", "", { page: "/x", body: "Two", parentId: root.id, anchor: null });
  await call("sam", "PATCH", `/${root.id}`, { resolved: true });
  await call("sam", "PATCH", `/${root.id}`, { resolved: false });
  await settle();
  assert.deepEqual(objects, ["thread.created", "thread.resolved"]);
  assert.deepEqual(functions, ["One", "Two"]);
});

test("when: a connector hears only what it picks", async () => {
  const heard: string[] = [];
  const { call, settle } = site({ when: (e) => e.page.startsWith("/app"), send: async (e) => void heard.push(e.page) });
  await call("alex", "POST", "", { page: "/app/settings", body: "Here", parentId: null, anchor });
  await call("alex", "POST", "", { page: "/blog", body: "Not here", parentId: null, anchor });
  await settle();
  assert.deepEqual(heard, ["/app/settings"]);
});

test("a connector that fails never costs the resolve", async () => {
  const { call, settle, errors } = site({
    events: ["thread.resolved"],
    send: async () => {
      throw new Error("notion down");
    },
  });
  const { comment: root } = await call("alex", "POST", "", { page: "/x", body: "Hi", parentId: null, anchor });
  const { status, comment } = await call("alex", "PATCH", `/${root.id}`, { resolved: true });
  assert.equal(status, 200);
  assert.equal(comment.resolved, true);
  await settle();
  assert.match(String(errors[0]), /notion down/);
});
