# Supabase: send comments to Slack with no server

With the [Supabase setup](../examples/supabase.md), comments go straight from the browser to your
database, so there's no `createDogear` to hand connectors to. The database tells you instead: a
Database Webhook calls an Edge Function whenever a row in `comments` is added or changed, and
the function posts to Slack.

It hears new threads, resolves and reopens. Replies are left out, so the channel stays quiet.

## 1. The function

`supabase/functions/dogear-slack/index.ts`:

```ts
// A row of the `comments` table from docs/examples/supabase.md, as the webhook sends it.
type Row = { id: string; page: string; parent_id: string | null; author_name: string; body: string; resolved: boolean };

const SLACK = Deno.env.get("SLACK_WEBHOOK_URL")!;
const SITE = Deno.env.get("SITE_URL")!; // where the pages are: https://fernhill.example

/** Slack's markup treats &, < and > as its own. */
const plain = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

Deno.serve(async (request) => {
  const { type, record, old_record } = (await request.json()) as { type: string; record: Row; old_record: Row | null };
  const path = record.page.split("?")[0];
  let line: string | null = null;
  if (type === "INSERT" && record.parent_id === null) line = `${record.author_name} started a thread on ${path}`;
  if (type === "UPDATE" && old_record && record.resolved !== old_record.resolved) {
    line = `A thread on ${path} was ${record.resolved ? "resolved" : "reopened"}`;
  }
  if (!line) return new Response(null, { status: 204 });

  const link = new URL(record.page, SITE);
  link.searchParams.set("dogear", record.id);
  const words = record.body.length > 300 ? `${record.body.slice(0, 299)}…` : record.body;
  const response = await fetch(SLACK, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: plain(line),
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `*${plain(line)}*\n>${plain(words).replace(/\n/g, "\n>")}` } },
        { type: "context", elements: [{ type: "mrkdwn", text: `<${link.href}|Open the thread>` }] },
      ],
    }),
  });
  return new Response(null, { status: response.ok ? 204 : 502 });
});
```

Then, from your project:

```sh
supabase secrets set SLACK_WEBHOOK_URL=https://hooks.slack.com/services/… SITE_URL=https://fernhill.example
supabase functions deploy dogear-slack
```

A row doesn't say who resolved it, so a resolve reads "A thread on /pricing was resolved". To
name them, add a `resolved_by` column that your `comments_guard` trigger fills from
`auth.uid()`.

## 2. The webhook

In the Supabase dashboard, open **Database Webhooks** and create one:

- **Table:** `comments`
- **Events:** Insert and Update
- **Type:** Supabase Edge Functions, `dogear-slack`

Every new row and every change now reaches the function, after it's saved. If Slack is down, the
comment is still saved; the webhook's log in the dashboard shows the failed call.

## Other tools

The same function can call Notion, Linear or GitHub instead of Slack: the
[recipes](README.md#the-recipes) show each API call, and only the line that picks what happened
changes.
