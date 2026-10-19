/**
 * `createDogear` keeps the contract, in each mode, on each store. The Postgres run needs a database:
 * DOGEAR_TEST_DATABASE_URL=postgres://… (it makes, and drops, a table of its own).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { Comment, User } from "../src/model.ts";
import { createDogear, type Created, type DogearOptions } from "../src/server/handler.ts";
import { postgresStore } from "../src/server/postgres.ts";
import { memoryStore, type Store } from "../src/server/store.ts";

const anchor = { selector: "main", fx: 0, fy: 0, fw: 0, fh: 0, vx: 0, vy: 0, vw: 0, vh: 0 };
const SECRET = "a-secret-that-is-long-enough-for-hmac-0123";
const ORIGIN = "https://site.test";

type Call = { body?: unknown; cookie?: string; user?: string; token?: string; ip?: string };

/** One request to the handler; answers the status, the JSON and any cookie it set. */
async function call(handler: (r: Request) => Promise<Response>, method: string, path: string, c: Call = {}) {
  const headers = new Headers();
  if (c.body !== undefined) headers.set("content-type", "application/json");
  if (c.cookie) headers.set("cookie", c.cookie);
  if (c.user) headers.set("x-user", c.user);
  if (c.token) headers.set("authorization", `Bearer ${c.token}`);
  headers.set("x-forwarded-for", c.ip ?? "203.0.113.1");
  const response = await handler(
    new Request(ORIGIN + "/api/comments" + path, {
      method,
      headers,
      body: c.body === undefined ? undefined : typeof c.body === "string" ? c.body : JSON.stringify(c.body),
      redirect: "manual",
    }),
  );
  const text = await response.text();
  const setCookie = response.headers.get("set-cookie");
  return {
    status: response.status,
    json: text ? JSON.parse(text) : null,
    cookie: setCookie ? setCookie.split(";")[0] : undefined,
    headers: response.headers,
  };
}

const root = (page = "/pricing", body = "Too small") => ({ page, body, parentId: null, anchor });

/** Some people a host's sign-in knows, by the x-user header (a stand-in for a session cookie). */
const PEOPLE: Record<string, User> = {
  asha: { id: "u-asha", name: "Asha Rao", avatar: "https://img.test/asha.png", email: "asha.rao@acme.test" },
  kabir: { id: "u-kabir", name: "Kabir", email: "kabir@acme.test" },
  boss: { id: "u-boss", name: "Boss", admin: true, handle: "the-boss" },
};
const auth: DogearOptions["auth"] = (request) => PEOPLE[request.headers.get("x-user") ?? ""] ?? null;

function suite(name: string, makeStore: () => Promise<Store & { done?: () => Promise<void> }>) {
  describe(name, () => {
    test("with nothing set up, anyone reads and nobody writes", async () => {
      const store = await makeStore();
      const dogear = createDogear({ store });
      assert.equal((await call(dogear, "GET", "?path=/")).status, 200);
      assert.deepEqual((await call(dogear, "GET", "?path=/")).json, []);
      assert.equal((await call(dogear, "GET", "/me")).status, 401);
      assert.equal((await call(dogear, "POST", "", { body: root() })).status, 401);
      assert.equal((await call(dogear, "POST", "/me", { body: { name: "Meera" } })).status, 404);
      assert.equal((await call(dogear, "GET", "?path=nope")).status, 400);
      assert.equal((await call(dogear, "GET", "/nothing/here")).status, 404);
      await store.done?.();
    });

    test("guests join by name, sign in by cookie, and are limited", async () => {
      assert.throws(() => createDogear({ store: memoryStore(), guests: true }), /secret/);
      const store = await makeStore();
      const dogear = createDogear({ store, guests: { tints: ["sky", "sage"] }, secret: SECRET });

      assert.equal((await call(dogear, "POST", "/me", { body: { name: "  " } })).status, 400);
      const joined = await call(dogear, "POST", "/me", { body: { name: "Meera  S", tint: "url(x)" } });
      assert.equal(joined.status, 200);
      assert.equal(joined.json.name, "Meera S");
      assert.equal(joined.json.tint, undefined, "an avatar the site doesn't have is dropped");
      assert.ok(joined.cookie?.startsWith("dogear_user="));
      const meera = joined.cookie!;
      assert.deepEqual((await call(dogear, "GET", "/me", { cookie: meera })).json, joined.json);

      // Renaming keeps the id; a tampered cookie is nobody.
      const renamed = await call(dogear, "POST", "/me", { cookie: meera, body: { name: "Meera", tint: "sky" } });
      assert.equal(renamed.json.id, joined.json.id);
      assert.equal(renamed.json.tint, "sky");
      const [payload, sig] = meera.slice("dogear_user=".length).split(".");
      const forged = Buffer.from(JSON.stringify({ id: "u-boss", name: "Boss", admin: true })).toString("base64url");
      assert.equal((await call(dogear, "GET", "/me", { cookie: `dogear_user=${forged}.${sig}` })).status, 401);
      assert.equal((await call(dogear, "GET", "/me", { cookie: `dogear_user=${payload}.x${sig}` })).status, 401);
      // A guest from before the rename to Dogear still has `inkd_user`, signed the same way.
      assert.equal((await call(dogear, "GET", "/me", { cookie: `inkd_user=${payload}.${sig}` })).json.id, joined.json.id);
      assert.equal((await call(dogear, "GET", "/me", { cookie: `inkd_user=${forged}.${sig}` })).status, 401);

      const thread = await call(dogear, "POST", "", { cookie: renamed.cookie, body: root() });
      assert.equal(thread.status, 201);
      assert.equal(thread.json.author.name, "Meera");
      assert.equal(thread.json.author.tint, "sky");

      // Resolving is for the thread's author on a guest site, and only threads resolve.
      const other = (await call(dogear, "POST", "/me", { body: { name: "Kabir" }, ip: "198.51.100.7" })).cookie!;
      const reply = await call(dogear, "POST", "", {
        cookie: other,
        ip: "198.51.100.7",
        body: { page: "/pricing", body: "Agreed", parentId: thread.json.id, anchor: null },
      });
      assert.equal(reply.status, 201);
      assert.equal((await call(dogear, "PATCH", `/${thread.json.id}`, { cookie: other, body: { resolved: true } })).status, 403);
      assert.equal((await call(dogear, "PATCH", `/${reply.json.id}`, { cookie: other, body: { resolved: true } })).status, 400);
      assert.equal((await call(dogear, "PATCH", `/${thread.json.id}`, { cookie: renamed.cookie, body: { resolved: true } })).json.resolved, true);

      // Five in ten minutes per person (one is already in).
      for (let i = 0; i < 4; i++) {
        assert.equal((await call(dogear, "POST", "", { cookie: renamed.cookie, body: root("/a", `n${i}`) })).status, 201);
      }
      assert.equal((await call(dogear, "POST", "", { cookie: renamed.cookie, body: root("/a", "six") })).status, 429);
      await store.done?.();
    });

    test("the admin key signs a browser in as the admin, who may delete anything", async () => {
      const store = await makeStore();
      const dogear = createDogear({ store, guests: true, secret: SECRET, adminKey: "open-sesame", adminName: "Harsh" });
      assert.equal((await call(dogear, "GET", "/admin?key=guess")).status, 403);
      const signedIn = await call(dogear, "GET", "/admin?key=open-sesame");
      assert.equal(signedIn.status, 303);
      assert.equal(signedIn.headers.get("location"), `${ORIGIN}/`);
      assert.ok(signedIn.headers.get("set-cookie")!.includes("Secure"), "https gets a Secure cookie");
      assert.deepEqual((await call(dogear, "GET", "/me", { cookie: signedIn.cookie })).json, {
        id: "admin",
        name: "Harsh",
        admin: true,
      });
      const guest = (await call(dogear, "POST", "/me", { body: { name: "Meera" } })).cookie!;
      const thread = await call(dogear, "POST", "", { cookie: guest, body: root() });
      assert.equal((await call(dogear, "DELETE", `/${thread.json.id}`, { cookie: signedIn.cookie })).status, 200);
      await store.done?.();
    });

    test("with your sign-in: authors, admins, the agent, and private pages", async () => {
      const store = await makeStore();
      const dogear = createDogear({
        store,
        auth,
        agentToken: "agent-token",
        canSee: (user, page) => !page.startsWith("/internal") || user?.id === "u-asha" || !!user?.admin,
      });
      const me = await call(dogear, "GET", "/me", { user: "asha" });
      assert.deepEqual(me.json, { ...PEOPLE.asha, handle: "asha.rao" }, "you see your own email; nobody else does");
      assert.equal((await call(dogear, "GET", "/me")).status, 401);
      assert.equal((await call(dogear, "POST", "/me", { user: "asha", body: { name: "Someone" } })).json.name, "Asha Rao");

      const thread = await call(dogear, "POST", "", { user: "asha", body: root("/pricing?tab=a") });
      assert.equal(thread.status, 201);
      assert.equal(thread.json.author.avatar, PEOPLE.asha.avatar);
      assert.equal(thread.json.author.email, undefined, "an email never goes on a comment");
      const secret = await call(dogear, "POST", "", { user: "asha", body: root("/internal/roadmap") });
      assert.equal((await call(dogear, "POST", "", { user: "kabir", body: root("/internal/x") })).status, 403);

      // Kabir can't see /internal at all: not in a list, not in ?all=1, not by id.
      assert.equal((await call(dogear, "GET", "?path=/internal/roadmap", { user: "kabir" })).status, 403);
      assert.deepEqual(
        (await call(dogear, "GET", "?all=1", { user: "kabir" })).json.map((c: Comment) => c.id),
        [thread.json.id],
      );
      assert.equal((await call(dogear, "GET", "?all=1", { user: "boss" })).json.length, 2);
      assert.equal((await call(dogear, "PATCH", `/${secret.json.id}`, { user: "kabir", body: { resolved: true } })).status, 404);
      assert.equal(
        (await call(dogear, "POST", "", {
          user: "kabir",
          body: { page: "/pricing", body: "sneaky", parentId: secret.json.id, anchor: null },
        })).status,
        404,
      );

      // Anyone signed in resolves; only the author edits; the author or an admin deletes.
      assert.equal((await call(dogear, "PATCH", `/${thread.json.id}`, { user: "kabir", body: { resolved: true } })).status, 200);
      assert.equal((await call(dogear, "PATCH", `/${thread.json.id}`, { user: "kabir", body: { body: "mine now" } })).status, 403);
      const edited = await call(dogear, "PATCH", `/${thread.json.id}`, { user: "asha", body: { body: "Much too small" } });
      assert.equal(edited.json.body, "Much too small");
      assert.ok(edited.json.editedAt >= edited.json.createdAt);
      assert.equal((await call(dogear, "DELETE", `/${thread.json.id}`, { user: "kabir" })).status, 403);

      // The agent: by token, replies and resolves, never deletes. A wrong token is refused.
      const agentReply = await call(dogear, "POST", "", {
        token: "agent-token",
        body: { page: "/pricing", body: "Fixed in Hero.tsx", parentId: thread.json.id, anchor: null },
      });
      assert.equal(agentReply.json.author.agent, true);
      assert.equal((await call(dogear, "DELETE", `/${agentReply.json.id}`, { token: "agent-token" })).status, 403);
      assert.equal((await call(dogear, "GET", "/me", { token: "guess", user: "asha" })).status, 401);

      // A thread goes with its replies.
      const deleted = await call(dogear, "DELETE", `/${thread.json.id}`, { user: "boss" });
      assert.deepEqual([...deleted.json.deleted].sort(), [thread.json.id, agentReply.json.id].sort());
      assert.deepEqual((await call(dogear, "GET", "?path=/pricing", { user: "asha" })).json, []);
      await store.done?.();
    });

    test("@mentions: people who have signed in, who can open the page", async () => {
      const store = await makeStore();
      const dogear = createDogear({
        store,
        auth,
        guests: true,
        secret: SECRET,
        canSee: (user, page) => !page.startsWith("/internal") || user?.id === "u-asha" || !!user?.admin,
      });
      // Only people who have signed in can be mentioned, so everyone looks once.
      for (const who of ["asha", "kabir", "boss"]) await call(dogear, "GET", "/me", { user: who });

      const people = await call(dogear, "GET", "/people", { user: "asha" });
      assert.deepEqual(people.json, [
        { id: "u-boss", name: "Boss", handle: "the-boss" },
        { id: "u-kabir", name: "Kabir", handle: "kabir" },
      ]);
      assert.equal((await call(dogear, "GET", "/people")).status, 403);
      const guest = (await call(dogear, "POST", "/me", { body: { name: "Meera" } })).cookie!;
      assert.equal((await call(dogear, "GET", "/people", { cookie: guest })).status, 403);

      const open = await call(dogear, "POST", "", {
        user: "asha",
        body: root("/pricing", "@Kabir and @the-boss, see this. Not @nobody, not @asha.rao, not me@kabir.com"),
      });
      assert.deepEqual(open.json.mentions, [
        { id: "u-kabir", name: "Kabir", handle: "kabir" },
        { id: "u-boss", name: "Boss", handle: "the-boss" },
      ]);
      assert.equal(open.json.skipped, undefined);

      // Kabir can't open /internal: he's skipped, by name, and not mentioned.
      const internal = await call(dogear, "POST", "", { user: "asha", body: root("/internal/plan", "@kabir @the-boss ok?") });
      assert.deepEqual(internal.json.mentions.map((m: { id: string }) => m.id), ["u-boss"]);
      assert.deepEqual(internal.json.skipped, ["Kabir"]);
      assert.equal((await call(dogear, "GET", "?path=/internal/plan", { user: "asha" })).json[0].skipped, undefined);

      // A guest can't ping anyone.
      const fromGuest = await call(dogear, "POST", "", { cookie: guest, body: root("/pricing", "hey @kabir") });
      assert.equal(fromGuest.json.mentions, undefined);

      // Editing says again who's mentioned; it's kept with the comment.
      const edited = await call(dogear, "PATCH", `/${open.json.id}`, { user: "asha", body: { body: "Only @the-boss now" } });
      assert.deepEqual(edited.json.mentions.map((m: { id: string }) => m.id), ["u-boss"]);
      const listed = (await call(dogear, "GET", "?path=/pricing", { user: "kabir" })).json as Comment[];
      assert.deepEqual(listed.find((c) => c.id === open.json.id)!.mentions!.map((m) => m.handle), ["the-boss"]);
      assert.equal((await call(dogear, "PATCH", `/${open.json.id}`, { user: "asha", body: { body: "Nobody" } })).json.mentions, undefined);
      await store.done?.();
    });

    test("moderation turns text away with a 422 the writer sees", async () => {
      const store = await makeStore();
      const dogear = createDogear({
        store,
        auth,
        guests: true,
        secret: SECRET,
        moderate: async (text) => (/rude/i.test(text) ? { ok: false, message: "Let's keep it kind." } : { ok: true }),
      });
      const rude = await call(dogear, "POST", "", { user: "asha", body: root("/", "so rude") });
      assert.deepEqual([rude.status, rude.json], [422, { error: "Let's keep it kind." }]);
      const fine = await call(dogear, "POST", "", { user: "asha", body: root("/", "lovely") });
      assert.equal((await call(dogear, "PATCH", `/${fine.json.id}`, { user: "asha", body: { body: "rude now" } })).status, 422);
      assert.equal((await call(dogear, "POST", "/me", { body: { name: "Rude Dude" } })).status, 422);
      assert.equal((await call(dogear, "POST", "", { user: "boss", body: root("/", "rude but admin") })).status, 201);
      await store.done?.();
    });

    test("hooks: onCreated runs deferred, with the thread, who's mentioned and a link", async () => {
      const store = await makeStore();
      const deferred: (() => Promise<void>)[] = [];
      const events: Created[] = [];
      const pages: [string | null, string, boolean][] = [];
      const directory = {
        list: async () => [{ id: "u-asha", name: "Asha Rao", handle: "asha", email: "asha.rao@acme.test" }],
        find: async (handle: string) =>
          handle === "zoya" ? { id: "zoya@acme.test", name: "zoya", handle: "zoya", email: "zoya@acme.test" } : null,
      };
      const dogear = createDogear({
        store,
        auth,
        directory,
        linkParam: "comment",
        defer: (task) => void deferred.push(task),
        onCreated: (event) => void events.push(event),
        // Kabir only sees /pricing when his request carries the view cookie; nobody mentioned sees /secret.
        canSee: (user, page, request) => {
          pages.push([user?.id ?? null, page, Boolean(request)]);
          if (page === "/secret") return Boolean(request);
          return true;
        },
        deletable: (user, comment) => comment.author.id === user.id || comment.author.name === "Scout",
      });
      const thread = await call(dogear, "POST", "", { user: "kabir", body: root("/pricing", "@asha @zoya @nobody look") });
      assert.equal(thread.status, 201);
      assert.deepEqual(thread.json.mentions.map((m: { handle: string }) => m.handle), ["asha", "zoya"]);
      assert.equal(events.length, 0, "nothing runs until the deferred work does");
      await Promise.all(deferred.splice(0).map((task) => task()));
      assert.equal(events.length, 1);
      assert.equal(events[0].link, `${ORIGIN}/pricing?comment=${thread.json.id}`);
      assert.deepEqual(events[0].mentioned.map((p) => p.email), ["asha.rao@acme.test", "zoya@acme.test"]);
      assert.equal(events[0].author.email, "kabir@acme.test");
      assert.deepEqual(events[0].thread.map((c) => c.id), [thread.json.id]);
      assert.ok(pages.some(([who, , withRequest]) => who === "u-kabir" && withRequest), "the writer is asked with the request");
      assert.ok(pages.some(([who, , withRequest]) => who === "u-asha" && !withRequest), "someone mentioned is asked without it");

      const reply = await call(dogear, "POST", "", {
        user: "asha",
        body: { page: "/pricing", body: "on it", parentId: thread.json.id, anchor: null },
      });
      await Promise.all(deferred.splice(0).map((task) => task()));
      assert.equal(events[1].link, `${ORIGIN}/pricing?comment=${thread.json.id}`, "a reply links to its thread");
      assert.deepEqual(events[1].thread.map((c) => c.id), [thread.json.id, reply.json.id]);
      assert.deepEqual(events[1].mentioned, []);

      // Someone mentioned who can't open the page is skipped, and the writer is told.
      const hidden = await call(dogear, "POST", "", { user: "kabir", body: root("/secret", "@asha see") });
      assert.equal(hidden.status, 201);
      assert.equal(hidden.json.mentions, undefined);
      assert.deepEqual(hidden.json.skipped, ["Asha Rao"]);
      await Promise.all(deferred.splice(0).map((task) => task()));
      assert.deepEqual(events[2].mentioned, []);

      // The directory is the @ list, and nobody is copied into the store's people.
      const people = (await call(dogear, "GET", "/people", { user: "kabir" })).json;
      assert.deepEqual(people.map((p: { handle: string }) => p.handle), ["asha"]);
      assert.deepEqual(await store.people(), []);

      // deletable: Asha can't delete Kabir's thread, but anyone may delete what the policy allows.
      assert.equal((await call(dogear, "DELETE", `/${thread.json.id}`, { user: "asha" })).status, 403);
      assert.equal((await call(dogear, "DELETE", `/${reply.json.id}`, { user: "kabir" })).status, 403, "Kabir wrote the thread, not the reply");
      assert.equal((await call(dogear, "DELETE", `/${reply.json.id}`, { user: "asha" })).status, 200);

      // A hook that throws is reported; the comment stays saved.
      const errors: unknown[] = [];
      const failing = createDogear({
        store,
        auth,
        onError: (e) => errors.push(e),
        onCreated: () => {
          throw new Error("alert service down");
        },
        defer: (task) => void deferred.push(task),
      });
      assert.equal((await call(failing, "POST", "", { user: "kabir", body: root("/b") })).status, 201);
      await Promise.all(deferred.splice(0).map((task) => task()));
      assert.equal(errors.length, 1);
      assert.equal((await call(failing, "GET", "?path=/b", { user: "kabir" })).json.length, 1);
      await store.done?.();
    });

    test("a thread keeps its snapshot; lists of every page leave it out", async () => {
      const store = await makeStore();
      const dogear = createDogear({ store, auth });
      const state = { key: "setup:stripe", data: { step: 3, name: "Acme", nested: { on: true } } };
      const made = await call(dogear, "POST", "", { user: "asha", body: { ...root("/setup/3"), state } });
      assert.equal(made.status, 201);
      assert.deepEqual(made.json.state, state);
      const [listed] = (await call(dogear, "GET", "?path=/setup/3", { user: "kabir" })).json as Comment[];
      assert.deepEqual(listed.state, state);
      const everywhere = (await call(dogear, "GET", "?all=1", { user: "kabir" })).json as Comment[];
      assert.equal(everywhere.length, 1);
      assert.equal("state" in everywhere[0], false);
      const plain = await call(dogear, "POST", "", { user: "asha", body: root("/setup/3", "no form") });
      assert.equal("state" in plain.json, false);
      const reply = { page: "/setup/3", body: "hm", parentId: made.json.id, anchor: null, state };
      assert.equal((await call(dogear, "POST", "", { user: "kabir", body: reply })).status, 400);
      await store.done?.();
    });

    test("GET /mentions: where you were mentioned, on pages you can open, newest first", async () => {
      const store = await makeStore();
      const dogear = createDogear({ store, auth, canSee: (user, page) => page !== "/boss-only" || Boolean(user?.admin) });
      // Everyone signs in once, so they can be mentioned.
      for (const who of ["asha", "kabir", "boss"]) await call(dogear, "GET", "/me", { user: who });
      const first = await call(dogear, "POST", "", { user: "asha", body: { ...root("/a", "@kabir look"), state: { key: "f", data: { a: 1 } } } });
      await call(dogear, "POST", "", { user: "asha", body: root("/b", "nothing for kabir") });
      const reply = await call(dogear, "POST", "", {
        user: "boss",
        body: { page: "/a", body: "@kabir and @asha.rao, agreed", parentId: first.json.id, anchor: null },
      });
      await call(dogear, "POST", "", { user: "kabir", body: root("/c", "@kabir talking to myself") });
      // Mentioned where he can't open the page: never his to see.
      await call(dogear, "POST", "", { user: "boss", body: root("/boss-only", "@kabir secret") });

      const mine = await call(dogear, "GET", "/mentions", { user: "kabir" });
      assert.equal(mine.status, 200);
      assert.deepEqual(mine.json.map((c: Comment) => c.id), [reply.json.id, first.json.id]);
      assert.equal("state" in mine.json[1], false, "no forms in the list");
      assert.deepEqual((await call(dogear, "GET", "/mentions", { user: "asha" })).json.map((c: Comment) => c.id), [reply.json.id]);
      assert.equal((await call(dogear, "GET", "/mentions")).status, 401);

      // Edited so it no longer mentions him: gone from his list.
      await call(dogear, "PATCH", `/${reply.json.id}`, { user: "boss", body: { body: "@asha.rao agreed" } });
      assert.deepEqual((await call(dogear, "GET", "/mentions", { user: "kabir" })).json.map((c: Comment) => c.id), [first.json.id]);
      await store.done?.();
    });

    test("an assistant answers new threads and @mentions, as itself, after the response", async () => {
      const store = await makeStore();
      const deferred: (() => Promise<void>)[] = [];
      const run = async () => {
        while (deferred.length) await deferred.shift()!();
      };
      const asked: string[][] = [];
      let reply: string | null = "Looks right to me, @kabir can confirm.";
      const dogear = createDogear({
        store,
        auth,
        defer: (task) => void deferred.push(task),
        assistant: {
          name: "Scout",
          aliases: ["claude"],
          maxReplies: 2,
          answer: async (thread, { link }) => {
            asked.push([...thread.map((c) => c.body), link]);
            return reply;
          },
        },
      });
      await call(dogear, "GET", "/me", { user: "kabir" });
      const people = (await call(dogear, "GET", "/people", { user: "asha" })).json;
      assert.deepEqual(people.at(-1), { id: "assistant:scout", name: "Scout", handle: "scout", agent: true, answers: "threads" });

      const thread = await call(dogear, "POST", "", { user: "asha", body: root("/p", "Is this price right?") });
      assert.equal(asked.length, 0, "not before the response");
      await run();
      assert.deepEqual(asked[0], ["Is this price right?", `${ORIGIN}/p?dogear=${thread.json.id}`]);
      let list = (await call(dogear, "GET", "?path=/p", { user: "asha" })).json as Comment[];
      assert.equal(list.length, 2);
      assert.deepEqual(list[1].author, { id: "assistant:scout", name: "Scout", agent: true });
      assert.equal(list[1].parentId, thread.json.id);
      assert.deepEqual(list[1].mentions, [{ id: "u-kabir", name: "Kabir", handle: "kabir" }], "it can mention people");

      // A reply that doesn't ask is left alone; one that does (by alias, too) is answered.
      const reply1 = (body: string) =>
        call(dogear, "POST", "", { user: "asha", body: { page: "/p", body, parentId: thread.json.id, anchor: null } });
      await reply1("thanks");
      await run();
      assert.equal(asked.length, 1);
      const called = await reply1("@claude and the tax?");
      assert.deepEqual(called.json.mentions, [{ id: "assistant:scout", name: "Scout", handle: "claude" }]);
      reply = "x".repeat(2500);
      await run();
      list = (await call(dogear, "GET", "?path=/p", { user: "asha" })).json as Comment[];
      assert.equal(list.at(-1)!.body.length, 2000, "cut to fit");
      assert.ok(list.at(-1)!.body.endsWith("…"));
      // Two answers is its most here.
      await reply1("@scout once more?");
      await run();
      assert.equal(asked.length, 2);

      // Staying quiet saves nothing; the agent token's comments are never answered.
      reply = null;
      await call(dogear, "POST", "", { user: "kabir", body: root("/q", "hello") });
      await run();
      assert.equal(asked.length, 3);
      assert.equal((await call(dogear, "GET", "?path=/q", { user: "kabir" })).json.length, 1);
      await store.done?.();
    });

    test("an assistant that answers only when asked", async () => {
      const store = await makeStore();
      const deferred: (() => Promise<void>)[] = [];
      let asked = 0;
      const dogear = createDogear({
        store,
        auth,
        agentToken: "agent-token",
        defer: (task) => void deferred.push(task),
        assistant: { name: "Ask Me", answers: "mentions", answer: async () => (asked++, "Here.") },
      });
      assert.equal((await call(dogear, "GET", "/people", { user: "asha" })).json.at(-1).answers, "mentions");
      await call(dogear, "POST", "", { user: "asha", body: root("/p", "Just a note") });
      await call(dogear, "POST", "", { user: "asha", body: root("/p", "@ask-me what is this?") });
      await call(dogear, "POST", "", { token: "agent-token", body: root("/p", "@ask-me from the coding agent") });
      for (const task of deferred) await task();
      assert.equal(asked, 1);
      await store.done?.();
    });

    test("reactions: one each, all of them counted when people react at once", async () => {
      const store = await makeStore();
      const dogear = createDogear({ store, auth, agentToken: "agent-token" });
      const thread = await call(dogear, "POST", "", { user: "asha", body: root() });
      const react = (user: string, emoji: string) =>
        call(dogear, "POST", `/${thread.json.id}/reactions`, { user, body: { emoji } });
      assert.deepEqual((await react("asha", "🔥")).json.reactions, { "🔥": ["u-asha"] });
      assert.deepEqual((await react("asha", "🔥")).json.reactions ?? {}, {});
      assert.equal((await react("asha", "lol")).status, 400);
      assert.equal((await call(dogear, "POST", `/${thread.json.id}/reactions`, { body: { emoji: "🔥" } })).status, 401);
      await Promise.all(["asha", "kabir", "boss"].map((who) => react(who, "👀")));
      const [after] = (await call(dogear, "GET", "?path=/pricing", { user: "asha" })).json as Comment[];
      assert.deepEqual([...after.reactions!["👀"]].sort(), ["u-asha", "u-boss", "u-kabir"]);
      assert.equal((await call(dogear, "POST", "/nope/reactions", { user: "asha", body: { emoji: "🔥" } })).status, 404);
      await store.done?.();
    });
  });
}

test("a store that fails answers 503, and is set up again on the next request", async () => {
  let tries = 0;
  const broken = {
    ...memoryStore(),
    async init() {
      if (++tries === 1) throw new Error("database down");
    },
  };
  const errors: unknown[] = [];
  const dogear = createDogear({ store: broken, onError: (e) => errors.push(e) });
  assert.equal((await call(dogear, "GET", "?path=/")).status, 503);
  assert.equal(errors.length, 1);
  assert.equal((await call(dogear, "GET", "?path=/")).status, 200);
  const signedIn = createDogear({ store: memoryStore(), auth });
  assert.equal((await call(signedIn, "POST", "", { user: "asha", body: "{nope" })).status, 400);
});

suite("memoryStore", async () => memoryStore());

const url = process.env.DOGEAR_TEST_DATABASE_URL;
if (url) {
  const { default: postgres } = await import("postgres");
  suite("postgresStore", async () => {
    const sql = postgres(url, { onnotice: () => {}, max: 1 });
    const table = `dogear_test_${Math.random().toString(36).slice(2, 10)}`;
    const store = postgresStore({ query: (text, params) => sql.unsafe(text, params as never[]), table });
    await store.init!();
    return {
      ...store,
      done: async () => {
        await sql.unsafe(`drop table if exists ${table}`);
        await sql.end();
      },
    };
  });
} else {
  test("postgresStore (skipped: set DOGEAR_TEST_DATABASE_URL)", { skip: true }, () => {});
}
