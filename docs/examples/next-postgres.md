# Next.js + any Postgres (Neon, RDS, Supabase-as-Postgres, local)

`createDogear` from `@harshi04/dogear/server` keeps the REST contract in one route, over your Postgres, with
`httpAdapter` in the browser. Auth is whatever your app already has (NextAuth, Clerk, Better
Auth, a session cookie), or none: visitors give a name.

## 1. The route: `app/api/comments/[[...rest]]/route.ts`

```ts
import { createDogear, postgresStore } from "@harshi04/dogear/server";
import postgres from "postgres"; // or @neondatabase/serverless, or pg: see below

const sql = postgres(process.env.DATABASE_URL!);

const dogear = createDogear({
  // Makes its table (dogear_comments) on the first request; `schema()` gives you the SQL to run yourself.
  store: postgresStore({ query: (text, params) => sql.unsafe(text, params as never[]) }),
  // Your session → a User, or null. The only part that changes per auth library.
  auth: async () => {
    // NextAuth: const s = await auth(); return s?.user ? { id: s.user.email!, name: s.user.name!, avatar: s.user.image ?? undefined } : null;
    // Clerk:    const u = await currentUser(); return u ? { id: u.id, name: u.fullName ?? "Someone", avatar: u.imageUrl } : null;
    // Admins:   return { ...user, admin: ADMINS.includes(user.id) } to let them delete anyone's comment.
    return null;
  },
  // Optional, for `dogear mcp`: a coding agent signs in with this bearer token.
  agentToken: process.env.DOGEAR_AGENT_TOKEN,
});

export { dogear as GET, dogear as POST, dogear as PATCH, dogear as DELETE };
```

Other clients, same store:

```ts
// Neon:          const sql = neon(process.env.DATABASE_URL!);
//                postgresStore({ query: (text, params) => sql.query(text, params) })
// node-postgres: const pool = new Pool({ connectionString: process.env.DATABASE_URL });
//                postgresStore({ query: (text, params) => pool.query(text, params).then((r) => r.rows) })
```

No accounts on your site? Drop `auth` and let visitors comment under a name:

```ts
createDogear({ store, guests: true, secret: process.env.DOGEAR_SECRET }); // 32+ random characters
```

and use `httpAdapter("/api/comments", { guests: true })` in the browser. Every option is in
[docs/server.md](../server.md).

## 2. Mount it

```tsx
// app/dogear-comments.tsx
"use client";
import { Comments, httpAdapter } from "@harshi04/dogear/react";
const adapter = httpAdapter("/api/comments");
export const DogearComments = () => <Comments adapter={adapter} shortcut="c" />;
```

Render `<DogearComments />` once in `app/layout.tsx`.

## Already made a `comments` table from an older version of this guide?

Pass `table: "comments"`. The store adds the columns it's missing (`author_admin`,
`author_agent`, `ip_hash`, `author_tint`, `reactions`) and keeps your rows.
