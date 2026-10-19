# The server: `@harshi04/dogear/server`

`createDogear` is the REST contract ([contract.md](contract.md)) as one function, `Request →
Response`, so you don't write the route yourself. It runs in a Next.js route handler, `dogear
serve`, or anything that speaks Fetch (Hono, Remix, Bun, Deno, Express through an adapter), on
Node.

```ts
// app/api/comments/[[...rest]]/route.ts
import { createDogear, postgresStore } from "@harshi04/dogear/server";

const dogear = createDogear({ store: postgresStore({ query }) /* , …what your site has */ });
export { dogear as GET, dogear as POST, dogear as PATCH, dogear as DELETE };
```

## It works with what you have

Nothing else is required. Each thing you add switches more on:

| You add | People get |
|---|---|
| a `store` | Comments everyone can read. Nobody can write yet. |
| `guests: true` + `secret` | Visitors comment under a name they give (a signed cookie). Rate limits come on. |
| `auth` | Your sign-in decides who's who: names, photos, admins. **@mentions** come on: anyone who has signed in can be tagged. |
| `agentToken` | A coding agent (`dogear mcp`) reads, replies and resolves. |
| `canSee` | Comments are as private as their pages. |
| `moderate` | Text is checked before it's saved. |
| `directory` | The @ list comes from your own people table, and people who have never signed in can be mentioned. |
| `onCreated` + `defer` | Your code runs after each comment is saved, after the response: alerts, an agent, counts. |
| `assistant` | An AI teammate answers threads in the thread, labelled as AI. |

| `notify` | Whoever is @mentioned hears about it outside the page: a webhook, or your own notifier. |

## Alerts

`notify` takes one notifier or a list. Each hears about every new comment after the response
(through `defer`), on its own: one that fails goes to `onError` and the rest still run.

```ts
import { createDogear, webhook } from "@harshi04/dogear/server";
import { after } from "next/server";

createDogear({
  store,
  auth,
  defer: after,
  linkParam: "comment",
  notify: [
    webhook({ url: process.env.ALERTS_WEBHOOK!, secret: process.env.ALERTS_SECRET }),
    dmMentioned, // your own: see below
  ],
});
```

- **`webhook({ url, secret?, headers? })`** POSTs `{ type: "comment.created", comment, thread,
  author, mentioned, link }` (no form snapshots). With `secret`, `x-dogear-signature: sha256=<hex>`
  is the HMAC of the body, to check on your end.
- **Your own:** `(event: Created) => Promise<void>`. `event.mentioned` is who to tell, emails
  included, already checked with `canSee`, so a notifier that DMs each of them in your chat app
  is a few lines. `excerpt(comment)` gives the comment's text with @handles as names.

`webhook()` tries once more after a network error or a 5xx. Slack, email and a shared outbox (retries
across restarts) are on the [roadmap](../ROADMAP.md).

## Mentions

With `auth`, typing `@` in a comment lists the people who have signed in, and picking one puts
`@handle` in the text. A handle is the `handle` your `auth` returns, else the email before the
@ (`tara.mehta`), else the name. Mentions are kept on the comment (`mentions`) and drawn as the
person's name.

- **Only people who have signed in can be mentioned.** Everyone `auth` returns is remembered
  (`store.people()`), so a handle that's nobody stays plain text. With a `directory`, your own
  records decide instead: `list()` is everyone, and `find(handle)` can name someone who isn't
  in it yet (e.g. any `handle@yourcompany.com`). Their email stays on the
  server, for alerts; `GET /people` and comments never show it.
- **Only they can mention.** A guest's `@name` stays plain text, so a stranger can't ping your
  team.
- **Only those who can open the page.** Someone mentioned on a page `canSee` hides from them is
  skipped: the response names them (`skipped`), and the writer sees "Kabir can't open this page.
  So they won't see this comment or be alerted."
- Editing a comment says again who it mentions.
- **They hear about it in the app.** `GET /mentions` lists where you were mentioned (on pages
  you can open, newest 50). The widget asks every 15 seconds while the tab is visible: a toast
  ("Asha mentioned you on Pricing", with View), an `@2` badge on the tray's pill, and an `@` filter
  in its head. What you've seen is kept in this browser.

## An assistant

An assistant answers in the thread, as itself. Its replies carry an "AI" tag, a sparkle avatar
and "Answered by AI". It's in the @ list, and while it works the thread says "Scout is reading…".

```ts
createDogear({
  store,
  auth,
  defer: after, // it runs after the response; on Vercel, give the route time (maxDuration)
  assistant: {
    name: "Scout",
    aliases: ["claude"],      // other @handles that call it
    answers: "threads",       // every new thread and any @scout; "mentions": only @scout
    maxReplies: 5,            // per thread
    answer: async (thread, { link }) => askYourModel(thread), // the text, or null to stay quiet
  },
  // Its words are nobody's, so anyone may clear them:
  deletable: (user, comment) => comment.author.id === user.id || Boolean(user.admin || comment.author.agent),
});
```

`answer` is where your model, knowledge base and tools go: Dogear only decides when to ask and
saves what it says (cut to 2000 characters). Give the widget the same `deletable`.

## Stores

| Store | For |
|---|---|
| `memoryStore()` | Tests and demos. Gone when the process stops. |
| `fileStore("comments.json")` | `dogear serve` and small sites with one process. |
| `postgresStore({ query, table? })` | Production: Neon, Supabase, RDS, local. Makes its table on first use. |
| your own | The few functions of the `Store` type. |

`postgresStore` takes any client as a `query(text, params) → rows` function:

```ts
postgresStore({ query: (text, params) => sql.unsafe(text, params) })                // postgres.js
postgresStore({ query: (text, params) => neon(url).query(text, params) })          // Neon
postgresStore({ query: (text, params) => pool.query(text, params).then((r) => r.rows) }) // pg
```

The table is `dogear_comments` unless you pass `table`. `schema(table)` returns its SQL, if you'd
rather run migrations yourself; every statement is safe to repeat.

## Options

| Option | Default | What it does |
|---|---|---|
| `store` | (required) | Where comments live. |
| `basePath` | `"/api/comments"` | Where the route is mounted. |
| `auth(request)` | none | Your session → a `User` (`id`, `name`, `avatar?`, `admin?`) or null. Trusted as given. |
| `guests` | off | `true`, or `{ cookie?, maxAgeDays?, tints? }`. `tints` lists your page's avatar keys; others are dropped. |
| `secret` | none | Signs the guest cookie and keys IP hashes. Required with `guests` or `adminKey`, 32+ characters. |
| `adminKey`, `adminName`, `adminRedirect` | none, "Admin", "/" | `GET /admin?key=…` signs that browser in as the admin: for a site whose only account is its owner. |
| `agentToken`, `agentName` | none, "Agent" | `Authorization: Bearer <token>` signs a request in as the agent. Any other bearer token gets a 401. |
| `canSee(user, page, request?)` | everyone sees everything | Checked on every read and write; `?all=1` keeps only what passes. `user` is null when signed out. `request` is there when it's about whoever sent it (read a view cookie, say), and absent when it's about someone mentioned. |
| `directory` | the people `auth` has returned | `{ list(), find?(handle) }`: who can be @mentioned, from your own records, emails included. Dogear then keeps no people of its own. |
| `deletable(user, comment)` | its author, or an admin | Who may delete a comment, e.g. anyone may delete the agent's. The agent never deletes. |
| `onCreated(event)` | none | After a comment is saved: `{ comment, thread, author, mentioned, link }`. `mentioned` are the people to alert (with emails, only those who can open the page, never the author); `link` opens the thread. What throws goes to `onError`. |
| `defer(task)` | run at once, not awaited | How `onCreated` runs after the response: Next's `after`, or your platform's `waitUntil`. |
| `notify` | none | A `Notifier`, or a list: `webhook(…)`, your own. See [Alerts](#alerts). |
| `assistant` | none | An AI teammate that answers in threads. See [An assistant](#an-assistant). |
| `linkParam` | `"dogear"` | The query parameter in `link`, e.g. `"comment"` for `?comment=<id>`. Give the widget the same `linkParam`. |
| `moderate(text, kind, user)` | none | `{ ok: false, message }` answers 422 and the layer shows `message`. Admins and the agent aren't checked. |
| `limits` | on with guests | `{ person: { count, minutes }, ip: { count, minutes } }`, or `false`. Admins and the agent aren't limited. |
| `resolvers` | "authors" with guests and no `auth`, else "anyone" | Who may resolve or reopen a thread. |
| `onError(error)` | `console.error` | Whatever made a request answer 503, and whatever `onCreated` throws. |

## What it guarantees

Every rule in [contract.md](contract.md), plus:

- **The author is never the browser's say-so:** it's your `auth`, the signed cookie, or the token.
- **Private pages stay private.** A comment on a page someone can't see is a 404 to them, not a
  403, so its id doesn't confirm it exists.
- **The agent never deletes,** and only threads resolve (not replies).
- **Anything that throws answers 503,** and the layer hides until the route answers again. The
  store's setup is retried on the next request.
