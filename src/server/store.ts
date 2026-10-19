import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { pathOf, toggleReaction, type Comment, type Mention, type Person } from "../model";

/**
 * Where a server keeps comments. `createDogear` asks only for what's here, so any database can sit
 * behind it: three ship with Dogear (`memoryStore`, `fileStore`, `postgresStore`), and one of your
 * own is these few functions.
 *
 * The store keeps whatever it's given. Every rule (who may write, edit, resolve, delete) is the
 * handler's, before the store is called.
 */
export type Store = {
  /** Every comment whose page's path is `path`, oldest first. */
  list(path: string): Promise<Comment[]>;
  /** Every comment on every page, oldest first. */
  all(): Promise<Comment[]>;
  get(id: string): Promise<Comment | null>;
  /** Save a new comment as given. `ip` is a keyed hash of the writer's IP, for `count`. */
  insert(comment: Comment, meta: { ip?: string }): Promise<Comment>;
  /** A new body, and who it now @mentions (an empty list: nobody). */
  edit(id: string, change: { body: string; editedAt: number; mentions: Mention[] }): Promise<Comment | null>;
  resolve(id: string, resolved: boolean): Promise<Comment | null>;
  /**
   * Toggle one person's reaction (`toggleReaction`), atomically: two people reacting at once both
   * count. null when there's no such comment.
   */
  react(id: string, emoji: string, userId: string): Promise<Comment | null>;
  /** Delete a comment and, if it's a thread's first, its replies. Every id that went. */
  remove(id: string): Promise<string[]>;
  /**
   * Optional: comments whose `mentions` include this person, newest first, at most `limit`.
   * Without it, `GET /mentions` reads `all()`.
   */
  mentioning?(userId: string, limit: number): Promise<Comment[]>;
  /** How many comments this author, or this IP hash, wrote since `since` (epoch ms). For limits. */
  count(by: { authorId: string } | { ip: string }, since: number): Promise<number>;
  /**
   * Everyone who has signed in (through `auth`), for the `@` list and to look up who a handle is.
   * `email` stays on the server: it's where alerts go.
   */
  people(): Promise<Known[]>;
  /** Note someone who signed in, or update their name, photo or email. */
  remember(person: Known): Promise<void>;
  /** Set up whatever the store needs (tables, a file). Called once, before the first request. */
  init?(): Promise<void>;
};

/**
 * A person as the server knows them, from what your sign-in last said: their email too, for
 * alerts, and whether they're an admin, so `canSee` can be asked about them.
 */
export type Known = Person & { email?: string; admin?: boolean };

/** Comments in memory, for tests and demos: gone when the process stops. */
export function memoryStore(initial: Comment[] = []): Store & { comments: Comment[] } {
  const ips = new Map<string, string>();
  const known = new Map<string, Known>();
  const self = {
    comments: [...initial],
    async people() {
      return [...known.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
    async remember(person: Known) {
      known.set(person.id, { ...person });
    },
    async list(path: string) {
      return self.comments.filter((c) => pathOf(c.page) === path);
    },
    async all() {
      return [...self.comments];
    },
    async get(id: string) {
      return self.comments.find((c) => c.id === id) ?? null;
    },
    async insert(comment: Comment, { ip }: { ip?: string }) {
      self.comments.push(comment);
      if (ip) ips.set(comment.id, ip);
      return comment;
    },
    async edit(id: string, { body, editedAt, mentions }: { body: string; editedAt: number; mentions: Mention[] }) {
      const comment = await self.get(id);
      if (!comment) return null;
      Object.assign(comment, { body, editedAt });
      if (mentions.length) comment.mentions = mentions;
      else delete comment.mentions;
      return comment;
    },
    async resolve(id: string, resolved: boolean) {
      const comment = await self.get(id);
      if (comment) comment.resolved = resolved;
      return comment;
    },
    async react(id: string, emoji: string, userId: string) {
      const comment = await self.get(id);
      if (!comment) return null;
      const reactions = toggleReaction(comment.reactions, emoji, userId);
      if (Object.keys(reactions).length) comment.reactions = reactions;
      else delete comment.reactions;
      return comment;
    },
    async remove(id: string) {
      const gone = self.comments.filter((c) => c.id === id || c.parentId === id).map((c) => c.id);
      self.comments = self.comments.filter((c) => !gone.includes(c.id));
      for (const g of gone) ips.delete(g);
      return gone;
    },
    async count(by: { authorId: string } | { ip: string }, since: number) {
      return self.comments.filter(
        (c) =>
          c.createdAt > since &&
          ("authorId" in by ? c.author.id === by.authorId : ips.get(c.id) === by.ip),
      ).length;
    },
  };
  return self;
}

/**
 * Comments in a JSON file (an array of comments), for `dogear serve` and small sites. Read once,
 * then written after every change: one write at a time, each to a temporary file renamed over the
 * old one, so a crash mid-write never leaves half a file. One process per file.
 */
export function fileStore(file: string): Store {
  const memory = memoryStore();
  let writing = Promise.resolve();
  const save = () => {
    writing = writing.then(async () => {
      const temp = `${file}.${process.pid}.tmp`;
      await writeFile(temp, JSON.stringify(memory.comments, null, 2));
      await rename(temp, file);
    });
    return writing;
  };
  /** A change, then the file, then its answer. */
  const saved =
    <A extends unknown[], R>(change: (...args: A) => Promise<R>) =>
    async (...args: A) => {
      const result = await change(...args);
      await save();
      return result;
    };
  return {
    ...memory,
    insert: saved(memory.insert),
    edit: saved(memory.edit),
    resolve: saved(memory.resolve),
    react: saved(memory.react),
    remove: saved(memory.remove),
    async init() {
      await mkdir(dirname(file), { recursive: true });
      try {
        memory.comments = JSON.parse(await readFile(file, "utf8")) as Comment[];
      } catch {
        // No file yet (or an unreadable one): start empty, and the first write creates it.
      }
    },
  };
}
