import { toggleReaction, type Anchor, type Comment, type Mention, type Snapshot } from "../model";
import type { Known, Store } from "./store";

/**
 * Comments in Postgres (Neon, Supabase, RDS, a local one), through whichever client you use: give
 * it a `query(text, params)` that returns rows.
 *
 *   postgres.js   query: (text, params) => sql.unsafe(text, params)
 *   Neon          query: (text, params) => neon(url).query(text, params)
 *   node-postgres query: (text, params) => pool.query(text, params).then((r) => r.rows)
 *
 * It makes its table on first use (`schema(table)`, safe to run again; or run it yourself), named
 * `dogear_comments` unless you say otherwise.
 */
export type Query = (text: string, params: unknown[]) => Promise<Record<string, unknown>[]>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The table, its indexes and every later column, each statement safe to repeat. */
export function schema(table = "dogear_comments"): string[] {
  const t = tableName(table);
  return [
    `create table if not exists ${t} (
       id uuid primary key,
       page text not null check (page like '/%' and length(page) <= 300),
       path text generated always as (split_part(page, '?', 1)) stored,
       parent_id uuid references ${t}(id) on delete cascade,
       author_id text not null,
       author_name text not null,
       author_admin boolean not null default false,
       author_agent boolean not null default false,
       body text not null check (length(body) between 1 and 2000),
       anchor jsonb,
       ip_hash text,
       created_at timestamptz not null default now(),
       edited_at timestamptz,
       resolved boolean not null default false,
       check ((parent_id is null) = (anchor is not null))
     )`,
    `create index if not exists ${t}_path on ${t} (path, created_at)`,
    `create index if not exists ${t}_author on ${t} (author_id, created_at)`,
    `create index if not exists ${t}_ip on ${t} (ip_hash, created_at)`,
    // Added after the first version, or missing from a table made by hand from an older guide.
    `alter table ${t} add column if not exists author_admin boolean not null default false`,
    `alter table ${t} add column if not exists author_agent boolean not null default false`,
    `alter table ${t} add column if not exists ip_hash text`,
    `alter table ${t} add column if not exists author_tint text`,
    `alter table ${t} add column if not exists author_avatar text`,
    `alter table ${t} add column if not exists reactions jsonb not null default '{}'::jsonb`,
    `alter table ${t} add column if not exists mentions jsonb not null default '[]'::jsonb`,
    `alter table ${t} add column if not exists state jsonb`,
    `create index if not exists ${t}_mentions on ${t} using gin (mentions jsonb_path_ops)`,
    // Everyone who has signed in: the @ list, and where alerts go.
    `create table if not exists ${t}_people (
       id text primary key,
       name text not null,
       handle text not null,
       avatar text,
       email text,
       admin boolean not null default false,
       seen_at timestamptz not null default now()
     )`,
    `alter table ${t}_people add column if not exists admin boolean not null default false`,
    `create index if not exists ${t}_people_handle on ${t}_people (handle)`,
  ];
}

function tableName(table: string) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/i.test(table)) throw new Error(`dogear: "${table}" isn't a table name`);
  return table;
}

/**
 * jsonb comes back parsed from most clients, as a string from a few. It goes in as text cast to
 * jsonb (`$1::text::jsonb`): a client that sees a bare `::jsonb` parameter may encode the string
 * as JSON again, storing a string instead of the object.
 */
const parsed = <T>(value: unknown): T | null =>
  value == null ? null : typeof value === "string" ? (JSON.parse(value) as T) : (value as T);

function fromRow(r: Record<string, unknown>): Comment {
  const reactions = parsed<Record<string, string[]>>(r.reactions);
  const mentions = parsed<Mention[]>(r.mentions);
  const state = parsed<Snapshot>(r.state);
  return {
    id: String(r.id),
    page: String(r.page),
    parentId: r.parent_id == null ? null : String(r.parent_id),
    body: String(r.body),
    author: {
      id: String(r.author_id),
      name: String(r.author_name),
      ...(r.author_avatar ? { avatar: String(r.author_avatar) } : {}),
      ...(r.author_tint ? { tint: String(r.author_tint) } : {}),
      ...(r.author_admin ? { admin: true } : {}),
      ...(r.author_agent ? { agent: true } : {}),
    },
    anchor: parsed<Anchor>(r.anchor),
    createdAt: +new Date(r.created_at as string),
    editedAt: r.edited_at ? +new Date(r.edited_at as string) : null,
    resolved: Boolean(r.resolved),
    ...(reactions && Object.keys(reactions).length ? { reactions } : {}),
    ...(mentions?.length ? { mentions } : {}),
    ...(state ? { state } : {}),
  };
}

export function postgresStore({ query, table = "dogear_comments" }: { query: Query; table?: string }): Store {
  const t = tableName(table);
  const one = async (text: string, params: unknown[]) => {
    const [row] = await query(text, params);
    return row ? fromRow(row) : null;
  };
  return {
    async init() {
      for (const statement of schema(t)) await query(statement, []);
    },
    async list(path) {
      return (await query(`select * from ${t} where path = $1 order by created_at, id`, [path])).map(fromRow);
    },
    async all() {
      return (await query(`select * from ${t} order by created_at, id`, [])).map(fromRow);
    },
    async mentioning(userId, limit) {
      return (
        await query(
          `select * from ${t} where mentions @> $1::text::jsonb order by created_at desc, id desc limit $2`,
          [JSON.stringify([{ id: userId }]), limit],
        )
      ).map(fromRow);
    },
    async get(id) {
      return UUID.test(id) ? one(`select * from ${t} where id = $1`, [id]) : null;
    },
    async insert(c, { ip }) {
      const row = await one(
        `insert into ${t} (id, page, parent_id, author_id, author_name, author_admin, author_agent,
           author_tint, author_avatar, body, anchor, ip_hash, created_at, mentions, state)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::text::jsonb, $12, to_timestamp($13 / 1000.0),
           $14::text::jsonb, $15::text::jsonb)
         returning *`,
        [
          c.id,
          c.page,
          c.parentId,
          c.author.id,
          c.author.name,
          Boolean(c.author.admin),
          Boolean(c.author.agent),
          c.author.tint ?? null,
          c.author.avatar ?? null,
          c.body,
          c.anchor ? JSON.stringify(c.anchor) : null,
          ip ?? null,
          c.createdAt,
          JSON.stringify(c.mentions ?? []),
          c.state ? JSON.stringify(c.state) : null,
        ],
      );
      return row!;
    },
    async edit(id, { body, editedAt, mentions }) {
      if (!UUID.test(id)) return null;
      return one(
        `update ${t} set body = $2, edited_at = to_timestamp($3 / 1000.0), mentions = $4::text::jsonb
         where id = $1 returning *`,
        [id, body, editedAt, JSON.stringify(mentions)],
      );
    },
    async people() {
      const rows = await query(`select id, name, handle, avatar, email, admin from ${t}_people order by name, id`, []);
      return rows.map(
        (r): Known => ({
          id: String(r.id),
          name: String(r.name),
          handle: String(r.handle),
          ...(r.avatar ? { avatar: String(r.avatar) } : {}),
          ...(r.email ? { email: String(r.email) } : {}),
          ...(r.admin ? { admin: true } : {}),
        }),
      );
    },
    async remember(p) {
      await query(
        `insert into ${t}_people (id, name, handle, avatar, email, admin) values ($1, $2, $3, $4, $5, $6)
         on conflict (id) do update set name = excluded.name, handle = excluded.handle,
           avatar = excluded.avatar, email = excluded.email, admin = excluded.admin, seen_at = now()`,
        [p.id, p.name, p.handle, p.avatar ?? null, p.email ?? null, Boolean(p.admin)],
      );
    },
    async resolve(id, resolved) {
      if (!UUID.test(id)) return null;
      return one(`update ${t} set resolved = $2 where id = $1 returning *`, [id, resolved]);
    },
    async react(id, emoji, userId) {
      if (!UUID.test(id)) return null;
      // Toggled against what was read, and written only if nobody changed it meanwhile; else read
      // again. Two people reacting at once both count, with no transaction to hold open.
      for (let attempt = 0; attempt < 8; attempt++) {
        const [row] = await query(`select reactions from ${t} where id = $1`, [id]);
        if (!row) return null;
        const before = parsed<Record<string, string[]>>(row.reactions) ?? {};
        const after = toggleReaction(before, emoji, userId);
        const next = await one(
          `update ${t} set reactions = $2::text::jsonb where id = $1 and reactions = $3::text::jsonb returning *`,
          [id, JSON.stringify(after), JSON.stringify(before)],
        );
        if (next) return next;
      }
      throw new Error("dogear: a reaction kept colliding; try again");
    },
    async remove(id) {
      if (!UUID.test(id)) return [];
      const rows = await query(`delete from ${t} where id = $1 or parent_id = $1 returning id`, [id]);
      return rows.map((r) => String(r.id));
    },
    async count(by, since) {
      const [column, value] = "authorId" in by ? ["author_id", by.authorId] : ["ip_hash", by.ip];
      const [row] = await query(
        `select count(*)::int as n from ${t} where ${column} = $1 and created_at > to_timestamp($2 / 1000.0)`,
        [value, since],
      );
      return Number(row?.n ?? 0);
    },
  };
}
