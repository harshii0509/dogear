# Supabase

> This guide is also on the docs site, at [dogear.harshux.com/docs/backends/supabase](https://dogear.harshux.com/docs/backends/supabase).

This setup fits Supabase's free tier and needs no server code of your own. Postgres stores the
comments, Supabase Auth decides who's who, Row Level Security keeps the rules, and Realtime sends
live updates.

## 1. Create the table and rules

Run this in the SQL editor.

```sql
create table comments (
  id uuid primary key default gen_random_uuid(),
  page text not null check (page like '/%' and length(page) <= 300),
  path text generated always as (split_part(page, '?', 1)) stored,
  parent_id uuid references comments(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id),
  author_name text not null,
  author_avatar text,
  body text not null check (length(body) between 1 and 2000),
  anchor jsonb,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  resolved boolean not null default false,
  check ((parent_id is null) = (anchor is not null))
);
create index on comments (path, created_at);

alter table comments enable row level security;
create policy "read"    on comments for select to authenticated using (true);
create policy "create"  on comments for insert to authenticated with check (author_id = auth.uid());
create policy "update"  on comments for update to authenticated using (true);
create policy "delete"  on comments for delete to authenticated using (author_id = auth.uid());

-- Anyone may resolve; only the author may change the words.
create function comments_guard() returns trigger language plpgsql as $$
begin
  if new.body is distinct from old.body then
    if old.author_id <> auth.uid() then raise exception 'not yours'; end if;
    new.edited_at := now();
  end if;
  if new.author_id <> old.author_id or new.page <> old.page then raise exception 'read only'; end if;
  return new;
end $$;
create trigger comments_guard before update on comments for each row execute function comments_guard();

alter publication supabase_realtime add table comments;
```

Tighten `read` if not every signed-in user should see every page.

Admins (optional) can delete anyone's comment. Keep them in a table, widen the `delete` policy,
and have `me()` say so:

```sql
create table admins (user_id uuid primary key references auth.users(id));
alter table admins enable row level security;
create policy "read own" on admins for select to authenticated using (user_id = auth.uid());
drop policy "delete" on comments;
create policy "delete" on comments for delete to authenticated
  using (author_id = auth.uid() or exists (select 1 from admins where user_id = auth.uid()));
```

## 2. Add the adapter

```ts
// comments-adapter.ts
import type { Adapter, Comment } from "@harshi04/dogear";
import { supabase } from "./supabase"; // your createClient(...)

type Row = {
  id: string; page: string; parent_id: string | null; author_id: string; author_name: string;
  author_avatar: string | null; body: string; anchor: Comment["anchor"]; created_at: string;
  edited_at: string | null; resolved: boolean;
};

const fromRow = (r: Row): Comment => ({
  id: r.id,
  page: r.page,
  parentId: r.parent_id,
  body: r.body,
  author: { id: r.author_id, name: r.author_name, ...(r.author_avatar ? { avatar: r.author_avatar } : {}) },
  anchor: r.anchor,
  createdAt: Date.parse(r.created_at),
  editedAt: r.edited_at ? Date.parse(r.edited_at) : null,
  resolved: r.resolved,
});

async function must<T>(query: PromiseLike<{ data: T | null; error: unknown }>) {
  const { data, error } = await query;
  if (error || data === null) throw error ?? new Error("no data");
  return data;
}

export const adapter: Adapter = {
  async me() {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return null;
    const meta = user.user_metadata ?? {};
    const { data: admin } = await supabase.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
    return { id: user.id, name: meta.full_name ?? meta.name ?? user.email ?? "Someone", avatar: meta.avatar_url, admin: Boolean(admin) };
  },
  async list(path) {
    const rows = await must(supabase.from("comments").select().eq("path", path).order("created_at"));
    return (rows as Row[]).map(fromRow);
  },
  async listAll() {
    const rows = await must(supabase.from("comments").select().order("created_at"));
    return (rows as Row[]).map(fromRow);
  },
  async create(input) {
    const me = await adapter.me();
    if (!me) throw new Error("signed out");
    const row = await must(
      supabase
        .from("comments")
        .insert({ page: input.page, body: input.body.trim(), parent_id: input.parentId, anchor: input.anchor, author_name: me.name, author_avatar: me.avatar ?? null })
        .select()
        .single(),
    );
    return fromRow(row as Row);
  },
  async update(id, patch) {
    const row = await must(
      supabase
        .from("comments")
        .update("body" in patch ? { body: patch.body.trim() } : { resolved: patch.resolved })
        .eq("id", id)
        .select()
        .single(),
    );
    return fromRow(row as Row);
  },
  async remove(id) {
    const replies = await must(supabase.from("comments").select("id").eq("parent_id", id));
    await must(supabase.from("comments").delete().eq("id", id).select("id").single());
    return [id, ...(replies as { id: string }[]).map((r) => r.id)];
  },
  subscribe(path, onChange) {
    const channel = supabase
      .channel(`comments:${path}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `path=eq.${path}` }, onChange)
      .subscribe();
    return () => void supabase.removeChannel(channel);
  },
};
```

`author_name` and `author_avatar` come from the browser, but RLS pins `author_id` to the
session, so the worst a user can do is misname themselves. If that matters, fill them in a
`before insert` trigger from `auth.users.raw_user_meta_data` instead.

## 3. Mount it

```tsx
<Comments adapter={adapter} shortcut="c" />
```
