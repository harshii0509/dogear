/**
 * The recipes in docs/connectors, as people copy them: what each one sends, against a fake fetch,
 * and how a resolve finds what a new thread made.
 */
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { github } from "../docs/connectors/github.ts";
import { linear } from "../docs/connectors/linear.ts";
import { notion } from "../docs/connectors/notion.ts";
import { slack } from "../docs/connectors/slack.ts";
import { teams } from "../docs/connectors/teams.ts";
import type { Comment } from "../src/model.ts";
import type { DogearEvent } from "../src/server/notify.ts";

const anchor = { selector: "main", fx: 0, fy: 0, fw: 0, fh: 0, vx: 0, vy: 0, vw: 0, vh: 0 };
const root: Comment = {
  id: "t1",
  page: "/pricing?plan=pro",
  parentId: null,
  body: "Can this say <every> plan & more?",
  author: { id: "alex", name: "Alex Doe" },
  anchor,
  createdAt: 1,
  editedAt: null,
  resolved: false,
};
const link = "https://fernhill.test/pricing?plan=pro&dogear=t1";
const created: DogearEvent = {
  type: "thread.created",
  actor: root.author,
  author: root.author,
  mentioned: [],
  comment: root,
  thread: [root],
  page: "/pricing",
  link,
};
const resolved: DogearEvent = {
  type: "thread.resolved",
  actor: { id: "riley", name: "Riley" },
  comment: { ...root, resolved: true },
  thread: [{ ...root, resolved: true }],
  page: "/pricing",
  link,
};
const reopened: DogearEvent = { ...resolved, type: "thread.reopened", comment: root, thread: [root] };

type Sent = { url: string; method: string; headers: Record<string, string>; body: any };
const real = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = real;
});
/** Swaps in a fetch that records each request and answers from `reply`. */
function fake(reply: (sent: Sent) => unknown = () => ({})) {
  const sent: Sent[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const item: Sent = {
      url: String(url),
      method: init.method ?? "GET",
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    };
    sent.push(item);
    return Response.json(reply(item));
  }) as typeof fetch;
  return sent;
}

test("slack: the headline, the words quoted and escaped, and a link back", async () => {
  const sent = fake();
  const connector = slack("https://hooks.slack.test/T/B/x");
  assert.equal(connector.events, undefined, "new threads and resolves, by default");
  await connector.send(created);
  const [{ url, body }] = sent;
  assert.equal(url, "https://hooks.slack.test/T/B/x");
  assert.equal(body.text, "Alex Doe started a thread on /pricing");
  assert.equal(body.blocks[0].text.text, "*Alex Doe started a thread on /pricing*\n>Can this say &lt;every&gt; plan &amp; more?");
  assert.equal(body.blocks[1].elements[0].text, `<${link}|Open the thread>`);
});

test("slack: events and when pass through", () => {
  const when = () => true;
  const connector = slack("https://hooks.slack.test/x", { events: ["comment.replied"], when });
  assert.deepEqual(connector.events, ["comment.replied"]);
  assert.equal(connector.when, when);
});

test("teams: an Adaptive Card with a button to the thread", async () => {
  const sent = fake();
  await teams("https://prod.workflows.test/hook").send(resolved);
  const { body } = sent[0];
  assert.equal(body.type, "message");
  const card = body.attachments[0];
  assert.equal(card.contentType, "application/vnd.microsoft.card.adaptive");
  assert.equal(card.content.body[0].text, "Riley resolved a thread on /pricing");
  assert.deepEqual(card.content.actions[0], { type: "Action.OpenUrl", title: "Open the thread", url: link });
});

test("notion: a row for a new thread, whose Status follows the thread", async () => {
  const connector = notion({ token: "secret_x", dataSource: "ds1" });
  assert.deepEqual(connector.events, ["thread.created", "thread.resolved", "thread.reopened"]);

  let sent = fake();
  await connector.send(created);
  assert.equal(sent[0].url, "https://api.notion.com/v1/pages");
  assert.equal(sent[0].headers.authorization, "Bearer secret_x");
  assert.equal(sent[0].headers["notion-version"], "2026-03-11");
  const { parent, properties } = sent[0].body;
  assert.deepEqual(parent, { type: "data_source_id", data_source_id: "ds1" });
  assert.equal(properties.Comment.title[0].text.content, root.body);
  assert.deepEqual(properties.Status, { select: { name: "Open" } });
  assert.equal(properties.Thread.rich_text[0].text.content, "t1");
  assert.equal(properties.Link.url, link);

  sent = fake((request) => (request.url.endsWith("/query") ? { results: [{ id: "row1" }] } : {}));
  await connector.send(resolved);
  assert.equal(sent[0].url, "https://api.notion.com/v1/data_sources/ds1/query");
  assert.deepEqual(sent[0].body.filter, { property: "Thread", rich_text: { equals: "t1" } });
  assert.equal(sent[1].url, "https://api.notion.com/v1/pages/row1");
  assert.equal(sent[1].method, "PATCH");
  assert.deepEqual(sent[1].body, { properties: { Status: { select: { name: "Resolved" } } } });

  sent = fake(() => ({ results: [] }));
  await connector.send(reopened);
  assert.equal(sent.length, 1, "no row, nothing to update");
});

test("linear: an issue with the thread attached; resolve moves it to done", async () => {
  assert.deepEqual(linear({ apiKey: "k", teamId: "team" }).events, ["thread.created"], "no states, new threads only");
  const connector = linear({ apiKey: "lin_api_x", teamId: "team", doneState: "done", openState: "todo" });
  assert.deepEqual(connector.events, ["thread.created", "thread.resolved", "thread.reopened"]);

  let sent = fake((request) =>
    request.body.query.includes("issueCreate") ? { data: { issueCreate: { issue: { id: "i1" } } } } : { data: {} },
  );
  await connector.send(created);
  assert.equal(sent[0].url, "https://api.linear.app/graphql");
  assert.equal(sent[0].headers.authorization, "lin_api_x");
  assert.equal(sent[0].body.variables.input.teamId, "team");
  assert.match(sent[0].body.variables.input.description, /\[Open the thread\]\(https:\/\/fernhill\.test/);
  assert.deepEqual(sent[1].body.variables.input, { issueId: "i1", title: "Dogear thread", subtitle: "/pricing", url: link });

  sent = fake((request) =>
    request.body.query.includes("attachmentsForURL")
      ? { data: { attachmentsForURL: { nodes: [{ issue: { id: "i1" } }] } } }
      : { data: {} },
  );
  await connector.send(resolved);
  assert.equal(sent[0].body.variables.url, link);
  assert.deepEqual(sent[1].body.variables, { id: "i1", input: { stateId: "done" } });

  fake(() => ({ errors: [{ message: "bad key" }] }));
  await assert.rejects(connector.send(created), /linear/);
});

test("github: an issue labelled dogear; resolve closes it, reopen opens it", async () => {
  const connector = github({ token: "ghp_x", repo: "fernhill/site" });

  let sent = fake();
  await connector.send(created);
  assert.equal(sent[0].url, "https://api.github.com/repos/fernhill/site/issues");
  assert.equal(sent[0].headers.authorization, "Bearer ghp_x");
  assert.deepEqual(sent[0].body.labels, ["dogear"]);
  assert.match(sent[0].body.body, /<!-- dogear:t1 -->$/);

  const issues = [
    { number: 3, body: "something else" },
    { number: 7, body: "Alex Doe started a thread\n\n<!-- dogear:t1 -->" },
  ];
  sent = fake((request) => (request.method === "GET" ? issues : {}));
  await connector.send(resolved);
  assert.equal(sent[0].url, "https://api.github.com/repos/fernhill/site/issues?labels=dogear&state=all&per_page=100&page=1");
  assert.equal(sent[1].url, "https://api.github.com/repos/fernhill/site/issues/7");
  assert.deepEqual(sent[1].body, { state: "closed", state_reason: "completed" });

  sent = fake((request) => (request.method === "GET" ? issues : {}));
  await connector.send(reopened);
  assert.deepEqual(sent[1].body, { state: "open" });

  sent = fake(() => []);
  await connector.send(resolved);
  assert.equal(sent.length, 1, "no issue for the thread, nothing to close");
});
