/** Alerts: webhooks, against a fake fetch, and how the handler runs every notifier. */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

import type { Comment, User } from "../src/model.ts";
import { createDogear, type Created } from "../src/server/handler.ts";
import { webhook } from "../src/server/notify.ts";
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
const event: Created = {
  comment,
  thread: [comment],
  author: { id: "alex@acme.test", name: "Alex Doe", email: "alex@acme.test" },
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
  await webhook({ url: "https://hooks.test/in", fetch })(event);
  assert.equal(sent.length, 2, "sent again after a 503");
});

test("webhook: posts the event without forms, signed with the secret", async () => {
  const { fetch, sent } = fake(() => new Response(null, { status: 204 }));
  await webhook({ url: "https://hooks.test/in", secret: "shh", headers: { "x-team": "a" }, fetch })(event);
  const [request] = sent;
  assert.equal(request.method, "POST");
  assert.equal(request.headers["x-team"], "a");
  const body = request.body as Record<string, unknown> & { comment: Comment; thread: Comment[] };
  assert.equal(body.type, "comment.created");
  assert.equal(body.link, event.link);
  assert.equal("state" in body.comment, false);
  assert.equal("state" in body.thread[0], false);
  const raw = JSON.stringify(body);
  assert.equal(request.headers["x-dogear-signature"], `sha256=${createHmac("sha256", "shh").update(raw).digest("hex")}`);

  const failing = fake(() => new Response("no", { status: 400 }));
  await assert.rejects(webhook({ url: "https://hooks.test/in", fetch: failing.fetch })(event), /400/);
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
