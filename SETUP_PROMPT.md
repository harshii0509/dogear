# Set up Dogear in this project

> Paste this whole file into your coding agent (Claude Code, Cursor, Codex, Copilot…) from the
> root of your project. It will ask you a couple of questions, then wire everything up.

---

You are adding **Dogear** to this project. It is Figma-style commenting on any page: pins,
marked areas, threaded replies, resolve. The UI is done. Your job is to connect it to a backend
**of the user's choice** and mount it. Follow these steps in order.

## Step 1: Look, then ask

Inspect the project first: framework (`package.json`, `next.config.*`, `vite.config.*`, plain
HTML), existing auth (NextAuth/Auth.js, Clerk, Supabase Auth, Firebase Auth, Better Auth, Lucia,
custom session), and any database or backend already in use.

Then ask the user **one** message with these questions, each with your recommendation based on
what you found:

1. **Where should comments be stored?** Offer what they already have first. Otherwise suggest:
   - *Just trying it out*: `localAdapter()` (this browser only, zero setup)
   - *Free and hosted, no server code*: Supabase (Postgres + auth + realtime)
   - *Already have Postgres (Neon, RDS, local)*: a route handler + `httpAdapter`
   - *Firebase / Firestore*, *Convex*, *PocketBase*, *their own API*: all fine; write an adapter
2. **Who is the user?** Reuse their existing auth. If there is none and the backend is not
   `localAdapter`, recommend the one that comes with the chosen backend.
3. **Who should see comments?** Default: every signed-in user, on every page. Optionally: only
   some environments (e.g. preview deploys), via `enabled`.
4. **Should your coding agent work on the comments?** (Recommended: yes.) Then `dogear mcp` lets
   Claude Code, Cursor or Codex read the threads, and if allowed, reply and resolve. It needs
   `listAll` on the adapter (or `GET ?all=1` on the route) and an agent token
   (`docs/contract.md`, "Agent tokens").

Do not continue until they answer.

## Step 2: Install

```bash
npm install @harshi04/dogear     # or pnpm / yarn / bun
```

Plain HTML (no bundler): load it from a CDN (or download `element.global.js` from a GitHub release
and serve it from the site):

```html
<script src="https://cdn.jsdelivr.net/npm/@harshi04/dogear@0.5/dist/element.global.js"></script>
```

## Step 3: Write the adapter

The adapter is the only backend-specific code. Read `node_modules/dogear/docs/contract.md`
and follow it exactly. In short:

```ts
import type { Adapter } from "@harshi04/dogear";
// me()        → { id, name, avatar? } of the signed-in user, or null to hide the layer
// list(path)  → every Comment whose page's path (before "?") is `path`, oldest first
// create(in)  → store { page, body, parentId, anchor } signed as the current user; return the Comment
// update(id, { body } | { resolved }) → the updated Comment
// remove(id)  → ids deleted (a thread's first comment takes its replies)
// subscribe?(path, onChange) → unsubscribe  (only if the backend can push)
```

The rules, which you must enforce **on the backend** (server code, security rules or RLS), not
only in the adapter:

- The author comes from the session, never from the browser.
- New comments are validated: use `validateNew` from `@harshi04/dogear` in server code, or the same
  limits in database rules (`page` starts with `/`, ≤ 300 chars; body 1–2000 chars; a root has
  an `anchor`, a reply has none).
- Anyone signed in can read, reply and resolve. Only the author can edit a body. The author, or
  an admin (`me()` returns `admin: true`, and `remove` checks it too), can delete.
- Deleting a root deletes its replies.
- `list` matches on path, ignoring the query string. Store a `path` column or field.
- Throw on any failure.

Worked examples to copy from, in `node_modules/dogear/docs/examples/`:
- `supabase.md`: SQL schema, RLS, a trigger, and a full adapter with realtime.
- `next-postgres.md`: a Next.js route handler for any Postgres, plus `httpAdapter`.

For other backends, follow the same shape: one table or collection with the `Comment` fields
(snake_case is fine; map it in the adapter), the rules above as security rules, and `subscribe`
if the backend has live queries (Firestore `onSnapshot`, Convex `watchQuery`, PocketBase
`subscribe`).

Put the adapter in one file (e.g. `lib/comments-adapter.ts`). Put the schema and rules in a
migration or setup file that the project already uses, or a new `comments.sql` / rules file, and
tell the user exactly what to run or deploy.

## Step 4: Mount it once

- **Next.js App Router:** create a client component and render it once in the root layout.
  ```tsx
  "use client";
  import { Comments } from "@harshi04/dogear/react";
  import { adapter } from "@/lib/comments-adapter";
  export function DogearComments() {
    return <Comments adapter={adapter} shortcut="c" />;
  }
  ```
- **React (Vite, CRA, Remix, etc.):** render `<Comments adapter={adapter} />` once near the root.
- **Plain HTML / any other framework:**
  ```html
  <script src="/dogear/element.global.js"></script>
  <script type="module">
    import { adapter } from "./comments-adapter.js";
    Dogear.mount({ adapter, shortcut: "c" });
  </script>
  ```
  With a REST backend: `<dogear-comments endpoint="/api/comments"></dogear-comments>`.

Keep the adapter object stable (module scope), not created inline on every render.

## Step 5: Check it

1. Typecheck and build the project.
2. If you wrote a server route, `curl` it: `GET /me` returns the user, `POST` a comment, `GET
   ?path=` lists it, a `PATCH { body }` from a different user is refused, and `DELETE` of a root
   returns its replies' ids too.
3. Tell the user how to try it: open the app signed in, press **Comment** (or `C`), click to pin
   or drag to mark an area, reply, resolve. Then open a second browser as another user and
   check the comment appears within about 3 seconds (instantly with `subscribe`).

## Step 6 (if they said yes to agents): Connect the MCP

1. Add `listAll` to the adapter, or `GET ?all=1` to the route, and accept an agent token
   (`DOGEAR_AGENT_TOKEN`, compared in constant time) that signs in as
   `{ id: "agent", name: "Agent", agent: true }`.
2. Add the server for their agent (`docs/mcp.md`), for example a project `.mcp.json` running
   `npx dogear mcp --endpoint <their route> --write --site <their app URL>`, with `DOGEAR_TOKEN` taken
   from the environment, never written into the file.
3. Check it: `dogear_status` reports `connected` and `is_agent: true`, and `dogear_list_threads`
   shows the comment you made in Step 5.

Finish with a short summary: which files you added, what the user must run or deploy (migration,
env vars, security rules), and how to theme it (set `--dogear-accent`, `--dogear-surface`, `--dogear-font`
etc. on `:root`).
