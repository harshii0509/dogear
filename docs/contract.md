# The contract

Dogear talks to an **adapter**: five async functions you implement against whatever you use. Any
backend that keeps the rules below works. On Node, `createDogear` from `@harshi04/dogear/server` keeps all of
them for you, over Postgres, a file or memory ([server.md](server.md)).

## The `Comment`

```ts
type User = { id: string; name: string; avatar?: string; admin?: boolean; agent?: boolean };

type Comment = {
  id: string;              // any unique string (uuid, Firestore id, serial)
  page: string;            // path + query it was made on: "/settings?tab=security"
  parentId: string | null; // null on a thread's first comment, the root's id on a reply
  body: string;            // 1–2000 chars, trimmed
  author: User;            // set by the backend from the session, never trusted from the browser
  anchor: Anchor | null;   // set on roots only; store it as opaque JSON
  createdAt: number;       // epoch ms
  editedAt: number | null; // epoch ms of the last body change
  resolved: boolean;
  reactions?: Record<string, string[]>; // each emoji to who picked it
  mentions?: { id: string; name: string; handle: string }[]; // who its @handles are, set by the backend
  state?: { key: string; data: unknown }; // roots only: the form on screen when it was written, as given (≤ 64 KB of JSON)
};
```

`Anchor` is opaque to your backend: store it as JSON (`jsonb`, a map, a string) and return it
unchanged.

## The adapter

```ts
import type { Adapter } from "@harshi04/dogear";

const adapter: Adapter = {
  me,       // () => Promise<User | null>          null hides the layer (signed out)
  list,     // (path) => Promise<Comment[]>         every comment whose page's path is `path`, oldest first
  create,   // (NewComment) => Promise<Comment>     NewComment = { page, body, parentId, anchor }
  update,   // (id, { body } | { resolved }) => Promise<Comment>
  remove,   // (id) => Promise<string[]>            every id deleted
  subscribe // optional: (path, onChange) => unsubscribe
  listAll   // optional: () => Promise<Comment[]>    every page, oldest first; what `dogear mcp` and the tray read
  join      // optional: (name) => Promise<User>     sign a visitor in as a guest; see "Guests"
  react     // optional: (id, emoji) => Promise<Comment>  toggle the current user's reaction
  people    // optional: () => Promise<Person[]>     who can be @mentioned: Person = { id, name, handle, avatar? }
};
```

## The rules every backend must keep

1. **The author comes from your session.** Never trust an author sent by the browser.
2. **Validate on the way in.** Run `validateNew(input)` (exported from `@harshi04/dogear`, safe on a
   server) on anything the browser sends to `create`, or enforce the same limits in your
   database rules: `page` starts with `/` and is ≤ 300 chars, `body` is 1–2000 chars after trim,
   and a root has an anchor while a reply has none.
3. **`list(path)` matches by path, ignoring the query string.** `/settings` and
   `/settings?tab=security` share threads. Store a `path` column (`page` up to the first `?`)
   and index it.
4. **Anyone who can see the page can read, reply, resolve and reopen.**
5. **Only the author can edit a body. The author or an admin can delete a comment.** Editing
   sets `editedAt`. `me()` returns `admin: true` for whoever your backend treats as an admin,
   and `remove` must check the same thing: the flag only decides which buttons show.
6. **Deleting a thread's first comment deletes its replies.** `remove` returns every id that went.
7. **Throw on failure.** The layer rolls back its optimistic change and shows a toast.

Access to *pages* is yours to decide: if a user can't open a page, `list` should return nothing
(or throw) for it.

## The REST shape (for `httpAdapter`)

If you'd rather write a server route than an adapter, implement these and use
`httpAdapter("/api/comments")`. Cookies are sent with every request.

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET` | `/api/comments/me` | | `User`, or 401 when signed out |
| `POST` | `/api/comments/me` | `{ name, tint? }` | `User`, signed in as a guest (optional; `httpAdapter(…, { guests: true })`) |
| `GET` | `/api/comments?path=/x` | | `Comment[]` |
| `GET` | `/api/comments?all=1` | | `Comment[]`, every page, without `state` (optional; for `dogear mcp` and the tray) |
| `POST` | `/api/comments` | `NewComment` | `Comment` (201) |
| `PATCH` | `/api/comments/:id` | `{ body }` or `{ resolved }` | `Comment` |
| `DELETE` | `/api/comments/:id` | | `{ deleted: string[] }` |
| `GET` | `/api/comments/mentions` | | `Comment[]`: where the current user is @mentioned (`mentions` has their id), not by them, on pages they can open, newest first, without `state` (optional; for mention alerts) |
| `GET` | `/api/comments/people` | | `Person[]`: who can be @mentioned (optional; anything but 200 means nobody) |
| `POST` | `/api/comments/:id/reactions` | `{ emoji }` | `Comment`, the current user's reaction toggled (optional: `toggleReaction`, `cleanReaction`: exactly one emoji, not one of the rude few; `roomForReaction`: at most `MAX_REACTIONS` kinds, else 422 `{ error }`) |

Any non-2xx is a failure. A **422** means the route refused the text itself, for example a
moderation check on the comment, an edit or a guest's name: answer `{ "error": "…" }` and the layer
shows that line to the writer, keeping what they wrote so they can change it. When your backend is down, answer 503 (or anything but 401/403 on
`/me`): the layer hides itself after two failed looks in a row (and at once if it never loaded),
looks again after 30 s, 1 and 2 minutes, and comes back when you do. Requests time out after 8 s
(`httpAdapter(…, { timeout })`). Nothing the backend sends can break the host page: rows that
can't be drawn are dropped, and a render error removes only the layer.

`createDogear` (`@harshi04/dogear/server`, [server.md](server.md)) is a complete implementation;
`examples/next/app/api/comments/[[...rest]]/route.ts` mounts it in a few lines.

## Guests

On a public page (a portfolio, docs), visitors have no account. With `join`, the layer shows them
the threads read-only and asks for a name the first time they write.

- **Your backend mints the guest.** `POST /me { name }` creates a random id, keeps it in the
  session (an httpOnly cookie, signed or server-side), and returns the `User`. Never accept an id
  from the browser.
- **Names are 1–40 characters** after trimming. `cleanName` (exported from `@harshi04/dogear`) does it.
- **`tint` is the avatar they picked**, when the page offers some (`avatars`): a key, not a
  colour. Keep it on the user (and on their comments) only if it's one of your page's keys;
  `cleanTint` checks its shape. Anything else, drop it, and the layer picks one by id.
- **Public pages need limits.** Rate-limit `create` and `POST /me` per guest and per IP. Consider
  letting only a thread's author or an admin resolve it (and pass `resolvers="authors"` so the
  button agrees), and keep an admin who can delete.

## Agent tokens

`dogear mcp` lets a coding agent read threads, reply and resolve. Against a REST backend it runs
`httpAdapter(endpoint, { token })`, which sends `Authorization: Bearer <token>` instead of a
cookie. Accept that token in your route and sign the request in as an agent user:

```ts
if (bearer(request) === process.env.DOGEAR_AGENT_TOKEN) return { id: "agent", name: "Agent", agent: true };
```

- Compare tokens in constant time, keep the token out of the browser, and rotate it like any key.
- `agent: true` puts an "Agent" badge on its comments. The usual rules still apply: it can edit
  only its own comments, and it is not an admin unless you say so.
- Return every page from `GET ?all=1` (the adapter's `listAll`) so the agent can see all open
  feedback at once.

`createDogear({ agentToken })` does this; the Next example reads it from `DOGEAR_AGENT_TOKEN`.

## Live updates

Without `subscribe`, the layer polls `list` every 3 seconds while comment mode is on and the tab
is visible. That is plenty for a review with a handful of people. If your backend pushes
(Supabase Realtime, Firestore `onSnapshot`, Convex, Liveblocks, Pusher), implement `subscribe`
and call `onChange()` whenever a comment on that path changes; the layer then refetches.
