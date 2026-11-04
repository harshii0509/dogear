# Connectors

Send comment activity to the tools your team already works in: a Slack channel, a Notion
database, Linear or GitHub issues, or any URL. Comments stay in your own database. A connector
is a few lines of code on your server, and nothing goes through a Dogear service.

Connectors need the server half, `createDogear` ([server.md](../server.md)), or `dogear serve`.
On Supabase with no server of your own, use the [database trigger](supabase-trigger.md) instead.

## What Dogear sends

| Event | When |
|---|---|
| `thread.created` | Someone starts a thread |
| `comment.replied` | Someone replies in a thread |
| `thread.resolved` | Someone resolves a thread (the agent too) |
| `thread.reopened` | Someone reopens a resolved thread |

Every event carries:

- `actor`, who did it;
- `comment`, the comment just written (for a resolve or reopen, the thread's first comment);
- `thread`, oldest first;
- `page`, the path without the query (`/pricing`);
- `link`, which opens the thread on its page.

A new comment also has `author` and `mentioned` (who it @mentions, emails included).
`headline(event)` gives one plain line, "Alex Doe started a thread on /pricing", and
`excerpt(comment)` gives the words, with @handles as names.

## Add one

Each recipe here is a short file. Copy it into your project, then hand it to `notify`:

```ts
import { createDogear } from "@harshi04/dogear/server";
import { after } from "next/server";
import { slack } from "./connectors/slack";

const dogear = createDogear({
  store,
  auth,
  defer: after, // runs connectors after the response
  notify: [slack(process.env.SLACK_WEBHOOK_URL!)],
});
```

- **What each one hears.** New threads and resolves by default, so a channel isn't flooded with
  replies. Pick others with `events`: `slack(url, { events: ["thread.created", "comment.replied"] })`.
- **Only some pages or people.** `when` decides per event:
  `slack(url, { when: (event) => event.page.startsWith("/app") })`.
- **A failure never costs a comment.** Connectors run after the response, each on its own. One
  that throws goes to `onError`; the comment is saved and the others still run.
- **No code at all.** `webhook({ url, secret })` posts every event as JSON to Zapier, Make, n8n or
  your own service, signed with `x-dogear-signature`. `dogear serve --webhook <url>` does the
  same for a prototype on your machine.

## The recipes

| Tool | File | What it does |
|---|---|---|
| Slack | [slack.ts](slack.ts) | Posts to a channel: who did what, the words, and a link back |
| Microsoft Teams | [teams.ts](teams.ts) | The same, as an Adaptive Card in a channel |
| Notion | [notion.ts](notion.ts) | A row per thread, whose Status follows it to Resolved and back |
| Linear | [linear.ts](linear.ts) | An issue per thread; resolving moves it to done |
| GitHub Issues | [github.ts](github.ts) | An issue per thread; resolving closes it as completed |
| Supabase, no server | [supabase-trigger.md](supabase-trigger.md) | A database trigger and an Edge Function that post to Slack |

The `.ts` recipes are tested against a fake of each API (`test/connectors.test.ts`), so the file
you copy is the file that's checked. Those tests don't reach the live services and don't cover the
Supabase trigger, so try yours once on a test channel or database.

### Slack

1. Create a Slack app at api.slack.com/apps, turn on **Incoming Webhooks**, and add one to your
   channel.
2. Put its URL in `SLACK_WEBHOOK_URL`, and add `slack(process.env.SLACK_WEBHOOK_URL!)` to `notify`.

### Microsoft Teams

1. In the channel, open **Workflows** and pick **Send webhook alerts to a channel**. Teams
   retired its old incoming webhooks in 2026; Workflows is how a webhook posts to a channel now.
2. Copy the workflow's URL into `TEAMS_WEBHOOK_URL`, and add `teams(process.env.TEAMS_WEBHOOK_URL!)`.

Teams accepts the request before it posts the card, so a card that fails shows in the workflow's
run history, not in `onError`.

### Notion

1. Make a database with these properties: **Comment** (title), **Status** (select, with Open
   and Resolved), **Page** (text), **Author** (text), **Link** (URL), **Thread** (text).
2. Create an internal integration at notion.so/profile/integrations, and connect it to the
   database (the database's ⋯ menu, **Connections**).
3. Copy the data source id (the database's ⋯ menu, **Manage data sources**, **Copy ID**).
4. Add `notion({ token: process.env.NOTION_TOKEN!, dataSource: process.env.NOTION_DATA_SOURCE! })`.

Threads started before you connected it have no row, so their resolves are skipped.

### Linear

1. Create a personal API key (Settings, **Security & access**, **API keys**).
2. Copy your team's id, and the ids of the states to use for done and open (the command menu,
   **Copy model UUID** on a team or a workflow state).
3. Add `linear({ apiKey, teamId, doneState, openState })`. Leave out `doneState` or `openState`
   and resolving or reopening leaves the issue as it is.

The issue gets the thread's link as an attachment, which is how a resolve finds it again.

### GitHub Issues

1. Create a fine-grained token with **Issues: read and write** on the repository.
2. Add `github({ token: process.env.GITHUB_TOKEN!, repo: "owner/name" })`.

Issues are labelled `dogear` (`label` changes it). A resolve looks through the newest 300 of them
for the thread, so a thread resolved after 300 newer ones leaves its issue open. The token's owner
needs write access to the repository: without it GitHub drops the label, and a resolve can't find
the issue.

## Write your own

A connector is either a function, which hears every new comment (threads and replies), or an
object that picks:

```ts
import { headline, type Sender } from "@harshi04/dogear/server";

const log: Sender = {
  events: ["thread.created", "thread.resolved", "thread.reopened"],
  when: (event) => event.page !== "/playground",
  async send(event) {
    console.log(headline(event), event.link);
  },
};
```

A function of your own is the way to message whoever was @mentioned: `event.mentioned` has
their emails, already checked against `canSee`. See [server.md](../server.md#connectors).

Made one for another tool? A pull request with the file and its test is welcome.
