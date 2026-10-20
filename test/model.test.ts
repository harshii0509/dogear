/** The trust boundary is the logic worth a check: what an adapter should and shouldn't store. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cleanBody,
  cleanList,
  cleanName,
  cleanTint,
  firstName,
  groupThreads,
  initials,
  validateNew,
  withoutState,
  MAX_STATE,
  type Comment,
} from "../src/model.ts";

const anchor = { selector: "main > div:nth-of-type(2)", fx: 0.1, fy: 0.2, fw: 0, fh: 0, vx: 0.5, vy: 0.5, vw: 0, vh: 0 };

test("initials and first names", () => {
  assert.equal(initials("Alex Doe"), "AD");
  assert.equal(initials("Alex"), "A");
  assert.equal(initials(""), "?");
  assert.equal(firstName({ id: "1", name: "Alex Doe" }), "Alex");
});

test("a root needs a page, a body and a finite anchor", () => {
  assert.equal(validateNew({ page: "/s?tab=a", body: "  hi  ", parentId: null, anchor })?.body, "hi");
  assert.equal(validateNew({ page: "/x", body: "   ", parentId: null, anchor }), null);
  assert.equal(validateNew({ page: "/x", body: "a".repeat(2001), parentId: null, anchor }), null);
  assert.equal(validateNew({ page: "https://evil", body: "hi", parentId: null, anchor }), null);
  assert.equal(validateNew({ page: "/x", body: "hi", parentId: null, anchor: { ...anchor, fx: NaN } }), null);
  assert.equal(validateNew({ page: "/x", body: "hi", parentId: null, anchor: null }), null);
  assert.equal(validateNew(null), null);
});

test("a reply drops any anchor and extra fields", () => {
  assert.deepEqual(
    validateNew({ page: "/x", body: "yes", parentId: "abc", anchor, author: "spoof" }),
    { page: "/x", body: "yes", parentId: "abc", anchor: null },
  );
  assert.equal(validateNew({ page: "/x", body: "yes", parentId: "", anchor: null }), null);
});

test("a thread may carry a snapshot of its screen; a reply may not", () => {
  const root = { page: "/x", body: "hi", parentId: null, anchor };
  const state = { key: "setup:stripe", data: { step: 3, keys: ["a"] } };
  assert.deepEqual(validateNew({ ...root, state })?.state, state);
  assert.equal("state" in validateNew({ ...root, state: null })!, false, "null is none");
  assert.equal(validateNew({ ...root, state: { key: "", data: 1 } }), null);
  assert.equal(validateNew({ ...root, state: { key: "k".repeat(101), data: 1 } }), null);
  assert.equal(validateNew({ ...root, state: "setup" }), null);
  assert.equal(validateNew({ ...root, state: { key: "k", data: "a".repeat(MAX_STATE) } }), null);
  assert.equal(validateNew({ ...root, state: { key: "k", data: "nul\u0000" } }), null, "Postgres refuses NUL");
  assert.equal(validateNew({ page: "/x", body: "yes", parentId: "abc", anchor: null, state }), null);
  const comment = { ...validateNew({ ...root, state })!, id: "1", author: { id: "a", name: "A" }, createdAt: 1, editedAt: null, resolved: false };
  assert.equal("state" in withoutState(comment), false);
  assert.deepEqual(comment.state, state, "the original keeps it");
});

test("an anchor may carry a short text fingerprint, and only a short one", () => {
  assert.equal(validateNew({ page: "/x", body: "hi", parentId: null, anchor: { ...anchor, text: "Rotate key" } })?.anchor?.text, "Rotate key");
  assert.equal(validateNew({ page: "/x", body: "hi", parentId: null, anchor: { ...anchor, text: "a".repeat(201) } }), null);
});

test("an anchor may carry a short label, and only a short one", () => {
  assert.equal(validateNew({ page: "/x", body: "hi", parentId: null, anchor: { ...anchor, label: 'button "Save"' } })?.anchor?.label, 'button "Save"');
  assert.equal(validateNew({ page: "/x", body: "hi", parentId: null, anchor: { ...anchor, label: 42 } }), null);
  assert.equal(validateNew({ page: "/x", body: "hi", parentId: null, anchor: { ...anchor, label: "a".repeat(201) } }), null);
  assert.equal(validateNew({ page: "/x", body: "hi", parentId: null, anchor })?.anchor?.label, undefined);
});

test("an edited body follows the same rule as a new one", () => {
  assert.equal(cleanBody("  fixed typo \n"), "fixed typo");
  assert.equal(cleanBody("   "), null);
  assert.equal(cleanBody(42), null);
});

test("names: trimmed, one space between words, 1 to 40 characters", () => {
  assert.equal(cleanName("  Alex \n Doe "), "Alex Doe");
  assert.equal(cleanName("   "), null);
  assert.equal(cleanTint("sky"), "sky");
  assert.equal(cleanTint("dawn-2"), "dawn-2");
  for (const bad of ["", "Sky", "url(x)", "a".repeat(25), 3, null]) assert.equal(cleanTint(bad), null);
  assert.equal(cleanName("a".repeat(41)), null);
  assert.equal(cleanName(7), null);
});

test("threads group by page: this one first, then the rest, newest thread first", () => {
  let time = 0;
  const make = (id: string, page: string, parentId: string | null = null, resolved = false): Comment => ({
    id, page, parentId, body: id, resolved, editedAt: null, createdAt: ++time,
    author: { id: "a", name: "Alex" }, anchor: parentId ? null : anchor,
  });
  const comments = [
    make("home-old", "/"),
    make("work", "/work/a"),
    make("home-new", "/?tab=b"),
    make("about", "/about"),
    make("work-reply", "/work/a", "work"),
    make("done", "/", null, true),
  ];
  const { here, elsewhere } = groupThreads(comments, "/");
  assert.deepEqual(here.map((t) => t.root.id), ["home-new", "home-old"]);
  // The reply on /work/a doesn't move it: /about has the newer thread.
  assert.deepEqual(elsewhere.map((g) => g.path), ["/about", "/work/a"]);
  assert.deepEqual(elsewhere[1].threads.map((t) => [t.root.id, t.replies]), [["work", 1]]);
  assert.deepEqual(
    groupThreads(comments, "/", { resolved: true }).here.map((t) => t.root.id),
    ["done", "home-new", "home-old"],
  );
  // A late reply to the oldest thread leaves it at the bottom, and keeps the time it moved.
  const replied = groupThreads([...comments, make("old-reply", "/", "home-old")], "/").here;
  assert.deepEqual(replied.map((t) => t.root.id), ["home-new", "home-old"]);
  assert.equal(replied[1].lastActivity, time);
});

test("cleanList drops rows the layer can't draw, and refuses anything but an array", () => {
  const good = {
    id: "1", page: "/x", parentId: null, body: "hi", author: { id: "a", name: "Alex" },
    anchor, createdAt: 1, editedAt: null, resolved: false,
  };
  const reply = { ...good, id: "2", parentId: "1", anchor: null };
  const rows = [
    good, reply, null, "x",
    { ...good, id: "3", author: null },
    { ...good, id: "4", anchor: null },
    { ...good, id: "5", page: "x" },
    { ...good, id: "6", createdAt: "yesterday" },
  ];
  assert.deepEqual(cleanList(rows).map((c) => c.id), ["1", "2"]);
  assert.throws(() => cleanList({ error: "down" }));
  assert.throws(() => cleanList(null));
});

test("mentions: handles in a text, who someone is, and the text in pieces", async () => {
  const { mentionedHandles, handleOf, mentionParts } = await import("../src/model.ts");
  assert.deepEqual(mentionedHandles("hey @Jordan.Lee, mail me@sam.com. (@sam) and @jordan.lee."), ["jordan.lee", "sam"]);
  assert.equal(handleOf({ name: "Jordan Lee", email: "jordan.lee@acme.test" }), "jordan.lee");
  assert.equal(handleOf({ name: "Zoë Müller-Lee" }), "zoe.muller-lee");
  assert.equal(handleOf({ name: "Boss", handle: "The-Boss" }), "the-boss");
  const jordan = { id: "1", name: "Jordan", handle: "jordan.lee" };
  assert.deepEqual(mentionParts("hi @jordan.lee, and @nobody.", [jordan]), ["hi ", jordan, ", and @nobody."]);
  assert.deepEqual(mentionParts("no mentions saved @jordan.lee"), ["no mentions saved @jordan.lee"]);
});
