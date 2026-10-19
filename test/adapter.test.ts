/** `localAdapter` is also the reference for the contract every adapter keeps. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { httpAdapter, localAdapter } from "../src/adapter.ts";
import { cleanReaction, MAX_REACTIONS, reactionsOf, roomForReaction, toggleReaction } from "../src/model.ts";

const anchor = { selector: "body", fx: 0, fy: 0, fw: 0, fh: 0, vx: 0, vy: 0, vw: 0, vh: 0 };

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

test("lists by path, edits your own, resolves any, deletes a thread with its replies", async () => {
  const storage = memoryStorage();
  const asha = localAdapter({ storage, user: { id: "a", name: "Asha" } });
  const ravi = localAdapter({ storage, user: { id: "r", name: "Ravi" } });

  const root = await asha.create({ page: "/s?tab=a", body: "hi", parentId: null, anchor });
  const reply = await ravi.create({ page: "/s", body: "yo", parentId: root.id, anchor: null });
  await asha.create({ page: "/other", body: "x", parentId: null, anchor });

  assert.deepEqual((await ravi.list("/s")).map((c) => c.id), [root.id, reply.id]);
  assert.equal(root.author.id, "a");

  await assert.rejects(ravi.update(root.id, { body: "hijack" }));
  assert.equal((await asha.update(root.id, { body: " edited " })).body, "edited");
  assert.equal((await ravi.update(root.id, { resolved: true })).resolved, true);

  await assert.rejects(ravi.remove(root.id));
  assert.deepEqual(await asha.remove(root.id), [root.id, reply.id]);
  assert.equal((await asha.list("/s")).length, 0);
  assert.equal((await asha.list("/other")).length, 1);
});

test("an admin can delete anyone's thread; everyone else only their own", async () => {
  const storage = memoryStorage();
  const asha = localAdapter({ storage, user: { id: "a", name: "Asha" } });
  const ravi = localAdapter({ storage, user: { id: "r", name: "Ravi" } });
  const boss = localAdapter({ storage, user: { id: "b", name: "Boss", admin: true } });

  const root = await asha.create({ page: "/s", body: "hi", parentId: null, anchor });
  const reply = await ravi.create({ page: "/s", body: "yo", parentId: root.id, anchor: null });

  await assert.rejects(ravi.remove(root.id));
  await assert.rejects(boss.update(root.id, { body: "rewritten" }));
  assert.deepEqual(await boss.remove(root.id), [root.id, reply.id]);
  assert.equal((await asha.list("/s")).length, 0);
});

test("listAll returns every page, for agents", async () => {
  const asha = localAdapter({ storage: memoryStorage(), user: { id: "a", name: "Asha" } });
  await asha.create({ page: "/a", body: "one", parentId: null, anchor });
  await asha.create({ page: "/b?tab=x", body: "two", parentId: null, anchor });
  assert.deepEqual((await asha.listAll!()).map((c) => c.body), ["one", "two"]);
});

test("httpAdapter sends a token as a bearer header and asks ?all=1 for everything", async () => {
  const seen: { url: string; auth: string | null }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen.push({ url, auth: new Headers(init.headers).get("authorization") });
    return new Response("[]", { status: 200 });
  }) as typeof fetch;
  try {
    const api = httpAdapter("https://app.test/api/comments/", { token: "s3cret" });
    await api.listAll!();
    await api.list("/pricing");
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(seen, [
    { url: "https://app.test/api/comments?all=1", auth: "Bearer s3cret" },
    { url: "https://app.test/api/comments?path=%2Fpricing", auth: "Bearer s3cret" },
  ]);
});

test("a guest reads first, then joins by name and writes as themselves", async () => {
  const storage = memoryStorage();
  const guest = localAdapter({ storage, user: null });
  assert.equal(await guest.me(), null);
  await assert.rejects(guest.create({ page: "/", body: "hi", parentId: null, anchor }));
  await assert.rejects(guest.join!("   "));
  const me = await guest.join!("  Asha   Rao ");
  assert.equal(me.name, "Asha Rao");
  assert.equal((await guest.create({ page: "/", body: "hi", parentId: null, anchor })).author.id, me.id);
  // The same browser stays the same guest.
  assert.deepEqual(await localAdapter({ storage, user: null }).me(), me);
  // A signed-in adapter has nothing to join.
  assert.equal(localAdapter({ storage }).join, undefined);
  // The avatar they picked comes along, if it's a key at all.
  assert.equal((await localAdapter({ storage: memoryStorage(), user: null }).join!("Kabir", "sky")).tint, "sky");
  assert.equal((await localAdapter({ storage: memoryStorage(), user: null }).join!("Kabir", "url(x)")).tint, undefined);
});

test("httpAdapter joins with POST /me, only when guests are on", async () => {
  const seen: { method: string; url: string; body: unknown }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen.push({ method: init.method!, url, body: JSON.parse(String(init.body)) });
    return Response.json({ id: "g1", name: "Asha" });
  }) as typeof fetch;
  try {
    assert.equal(httpAdapter("/api/comments").join, undefined);
    const user = await httpAdapter("/api/comments", { guests: true }).join!("Asha");
    assert.deepEqual(user, { id: "g1", name: "Asha" });
    await httpAdapter("/api/comments", { guests: true }).join!("Asha", "peach");
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(seen, [
    { method: "POST", url: "/api/comments/me", body: { name: "Asha" } },
    { method: "POST", url: "/api/comments/me", body: { name: "Asha", tint: "peach" } },
  ]);
});

test("httpAdapter fails a request that hangs, and one that answers with something other than JSON", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((url: string, init: RequestInit) =>
    url.includes("hang")
      ? new Promise((_, reject) =>
          init.signal!.addEventListener("abort", () => reject(init.signal!.reason)),
        )
      : Promise.resolve(new Response("<!doctype html>", { status: 200 }))) as typeof fetch;
  // Node doesn't hold the process open for AbortSignal.timeout; this does, until the test ends.
  const alive = setInterval(() => {}, 1000);
  try {
    await assert.rejects(httpAdapter("/hang", { timeout: 20 }).list("/"));
    await assert.rejects(httpAdapter("/html").list("/"));
  } finally {
    clearInterval(alive);
    globalThis.fetch = realFetch;
  }
});

test("httpAdapter: only 401 or 403 from /me is signed out; a server error fails", async () => {
  const realFetch = globalThis.fetch;
  let status = 401;
  globalThis.fetch = (async () => new Response("{}", { status })) as typeof fetch;
  try {
    assert.equal(await httpAdapter("/api/comments").me(), null);
    status = 503;
    await assert.rejects(httpAdapter("/api/comments").me(), { status: 503 });
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("httpAdapter hands on the route's words when it refuses (422 { error })", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "Let's keep it kind." }), { status: 422 })) as typeof fetch;
  try {
    const api = httpAdapter("/api/comments");
    await assert.rejects(api.create({ page: "/", body: "x", parentId: null, anchor }), (error: unknown) => {
      assert.equal((error as { status?: number }).status, 422);
      assert.equal((error as { reason?: string }).reason, "Let's keep it kind.");
      return true;
    });
    // No JSON body: still a failure with its status, and no reason.
    globalThis.fetch = (async () => new Response("down", { status: 503 })) as typeof fetch;
    await assert.rejects(api.list("/"), (error: unknown) => {
      assert.equal((error as { status?: number }).status, 503);
      assert.equal((error as { reason?: string }).reason, undefined);
      return true;
    });
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("reactions: one per person per emoji, toggled, and only emoji", async () => {
  assert.equal(cleanReaction("❤️"), "❤️");
  assert.equal(cleanReaction(" 👍🏽 "), "👍🏽");
  assert.equal(cleanReaction("👨‍👩‍👧"), "👨‍👩‍👧");
  for (const one of ["❤", "🇮🇳", "#️⃣", "🏳️‍🌈", "🚀"]) assert.equal(cleanReaction(one), one);
  for (const bad of ["lol", "a❤️", "", "1", 5, null, "❤️".repeat(9), "🔥🔥", "👍👎"]) {
    assert.equal(cleanReaction(bad), null);
  }
  // The rude few, in any skin tone.
  for (const rude of ["🖕", "🖕🏽", "🍆", "🍑", "💦"]) assert.equal(cleanReaction(rude), null);

  const full = Object.fromEntries(
    Array.from({ length: MAX_REACTIONS }, (_, i) => [String.fromCodePoint(0x1f600 + i), ["a"]]),
  );
  assert.equal(roomForReaction(full, "😀"), true);
  assert.equal(roomForReaction(full, "🚀"), false);
  assert.equal(roomForReaction({ ...full, "😀": [] }, "🚀"), true);

  let map = toggleReaction(undefined, "🔥", "a");
  map = toggleReaction(map, "🔥", "b");
  assert.deepEqual(map, { "🔥": ["a", "b"] });
  assert.deepEqual(toggleReaction(toggleReaction(map, "🔥", "a"), "🔥", "b"), {});

  const storage = memoryStorage();
  const asha = localAdapter({ storage, user: { id: "a", name: "Asha" } });
  const ravi = localAdapter({ storage, user: { id: "r", name: "Ravi" } });
  const root = await asha.create({ page: "/r", body: "hi", parentId: null, anchor });
  await asha.react!(root.id, "❤️");
  const after = await ravi.react!(root.id, "❤️");
  assert.deepEqual(reactionsOf(after, "r"), [{ emoji: "❤️", count: 2, mine: true }]);
  assert.deepEqual(reactionsOf(after, "x"), [{ emoji: "❤️", count: 2, mine: false }]);
  await assert.rejects(ravi.react!(root.id, "nope"));
  await assert.rejects(ravi.react!(root.id, "🖕"));
});
