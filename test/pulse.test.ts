/** The Pulse is arithmetic people will read as fact, so each number gets a check. */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Comment, User } from "../src/model.ts";
import { pulseOf } from "../src/pulse.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 9, 28, 12);

const alex: User = { id: "a", name: "Alex Doe" };
const sam: User = { id: "s", name: "Sam" };
const riley: User = { id: "r", name: "Riley" };

const anchor = (label?: string) => ({
  selector: "main > p",
  fx: 0, fy: 0, fw: 0, fh: 0, vx: 0, vy: 0, vw: 0, vh: 0,
  ...(label ? { label } : {}),
});

let n = 0;
/** A thread's first comment, `ago` before NOW. */
function root(author: User, ago: number, page = "/", label?: string, resolved = false): Comment {
  n += 1;
  return {
    id: `t${n}`, page, parentId: null, body: "hi", author, anchor: anchor(label),
    createdAt: NOW - ago, editedAt: null, resolved,
  };
}
function reply(to: Comment, author: User, after: number): Comment {
  n += 1;
  return {
    id: `r${n}`, page: to.page, parentId: to.id, body: "yes", author, anchor: null,
    createdAt: to.createdAt + after, editedAt: null, resolved: false,
  };
}

test("nothing yet is all zeros, not errors", () => {
  const pulse = pulseOf([], { now: NOW });
  assert.equal(pulse.open, 0);
  assert.equal(pulse.resolved, 0);
  assert.deepEqual(pulse.started, { thisWeek: 0, lastWeek: 0 });
  assert.deepEqual(pulse.daily, Array(14).fill(0));
  assert.deepEqual(pulse.firstReply, { median: null, threads: 0 });
  assert.deepEqual(pulse.waiting, []);
  assert.equal(pulse.waitingTotal, 0);
  assert.deepEqual(pulse.pages, []);
  assert.deepEqual(pulse.spots, []);
  assert.deepEqual(pulse.people, []);
});

test("open and resolved count threads, not replies, and this week against last", () => {
  const a = root(alex, 1 * DAY);
  const b = root(sam, 3 * DAY, "/pricing", undefined, true);
  const c = root(riley, 9 * DAY);
  const old = root(alex, 40 * DAY, "/", undefined, true);
  const pulse = pulseOf([a, b, c, old, reply(a, sam, HOUR)], { now: NOW });
  assert.equal(pulse.open, 2);
  assert.equal(pulse.resolved, 2);
  assert.deepEqual(pulse.started, { thisWeek: 2, lastWeek: 1 });
});

test("the week's edges: a moment under 7 days ago is this week, exactly 7 is last", () => {
  const edge = root(alex, 7 * DAY - 1);
  const past = root(alex, 7 * DAY);
  assert.deepEqual(pulseOf([edge, past], { now: NOW }).started, { thisWeek: 1, lastWeek: 1 });
});

test("daily counts every comment in its 24 hours, oldest day first", () => {
  const a = root(alex, 0);
  const b = root(sam, 2 * HOUR);
  const c = root(riley, 13 * DAY + HOUR);
  const pulse = pulseOf([a, b, reply(a, sam, 0), c, root(alex, 20 * DAY)], { now: NOW });
  assert.equal(pulse.daily.length, 14);
  assert.equal(pulse.daily[13], 3);
  assert.equal(pulse.daily[0], 1);
  assert.equal(pulse.daily.reduce((sum, d) => sum + d, 0), 4);
});

test("first reply is someone else's, and the median of those", () => {
  const a = root(alex, 5 * DAY);
  const b = root(sam, 4 * DAY);
  const c = root(riley, 3 * DAY);
  const pulse = pulseOf(
    [
      a, reply(a, alex, HOUR), reply(a, sam, 2 * HOUR),
      b, reply(b, alex, 4 * HOUR),
      c, reply(c, riley, HOUR),
    ],
    { now: NOW },
  );
  // a waited 2h (its own reply doesn't count), b 4h; c only talked to itself.
  assert.deepEqual(pulse.firstReply, { median: 3 * HOUR, threads: 2 });
  assert.deepEqual(pulse.waiting.map((t) => t.id), [c.id]);
});

test("waiting is open threads nobody answered, longest first, up to top", () => {
  const threads = [root(alex, 1 * DAY), root(sam, 5 * DAY), root(riley, 3 * DAY), root(alex, 2 * DAY)];
  const done = root(sam, 9 * DAY, "/", undefined, true);
  const pulse = pulseOf([...threads, done], { now: NOW, top: 2 });
  assert.deepEqual(pulse.waiting.map((t) => t.id), [threads[1].id, threads[2].id]);
  assert.equal(pulse.waitingTotal, 4);
});

test("pages rank by open threads, query strings folded, ties by path", () => {
  const pulse = pulseOf(
    [
      root(alex, DAY, "/pricing?plan=pro"), root(sam, DAY, "/pricing"),
      root(riley, DAY, "/docs"), root(alex, DAY, "/about"),
      root(sam, DAY, "/team"), root(sam, DAY, "/x", undefined, true),
    ],
    { now: NOW },
  );
  assert.deepEqual(pulse.pages, [
    { path: "/pricing", open: 2 },
    { path: "/about", open: 1 },
    { path: "/docs", open: 1 },
  ]);
});

test("spots group by page and element label, resolved threads included", () => {
  const pulse = pulseOf(
    [
      root(alex, DAY, "/", 'button "Save"'),
      root(sam, DAY, "/", 'button "Save"', true),
      root(riley, DAY, "/pricing", 'button "Save"'),
      root(alex, DAY, "/", "  "),
      root(alex, DAY, "/"),
    ],
    { now: NOW },
  );
  assert.deepEqual(pulse.spots, [
    { path: "/", label: 'button "Save"', threads: 2 },
    { path: "/pricing", label: 'button "Save"', threads: 1 },
  ]);
});

test("people are this week's commenters, most comments first", () => {
  const a = root(alex, DAY);
  const pulse = pulseOf([a, reply(a, sam, HOUR), reply(a, sam, 2 * HOUR), root(riley, 8 * DAY)], {
    now: NOW,
  });
  assert.deepEqual(
    pulse.people.map((p) => [p.user.name, p.comments]),
    [["Sam", 2], ["Alex Doe", 1]],
  );
});
