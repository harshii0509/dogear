import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import {
  cleanBody,
  cleanName,
  cleanReaction,
  cleanTint,
  handleOf,
  MAX_BODY,
  mentionedHandles,
  pathOf,
  roomForReaction,
  withoutState,
  validateNew,
  type Comment,
  type Mention,
  type Person,
  type User,
} from "../model";
import type { Notifier } from "./notify";
import type { Known, Store } from "./store";

/**
 * `createDogear`: the REST contract (`docs/contract.md`) as one `Request → Response` function, for a
 * Next route, `dogear serve`, or any server that speaks Fetch. It works with nothing but a store,
 * and each thing you add switches more on:
 *
 *   nothing          everyone reads; nobody can write (pass `guests` or `auth`)
 *   guests + secret  visitors comment under a name they give (signed cookie), on a public site
 *   auth             your sign-in decides who's who: names, photos, admins
 *   agentToken       a coding agent (`dogear mcp`) reads, replies and resolves with a bearer token
 *   canSee           comments are as private as their pages
 *   moderate         text is checked before it's saved; a refusal is a 422 the writer sees
 *   onCreated        something happens after a comment is saved (alerts, an agent), via `defer`
 *
 *   // app/api/comments/[[...rest]]/route.ts
 *   const dogear = createDogear({ store: postgresStore({ query }), guests: true, secret: process.env.DOGEAR_SECRET });
 *   export { dogear as GET, dogear as POST, dogear as PATCH, dogear as DELETE };
 *
 * Anything that throws inside (the database down, a bug) answers 503, which the layer reads as
 * "hide for now"; the page never notices.
 */
export type DogearOptions = {
  store: Store;
  /** Where the route is mounted. Default "/api/comments". */
  basePath?: string;
  /**
   * Who is signed in, from your own session: return the `User` (an `id` that's stable for that
   * person, their name, `avatar`, `email`, and `admin: true` for those who may delete anyone's
   * comment), or null. Trusted as given; this is your sign-in, not the browser's say-so.
   *
   * Everyone it returns can be @mentioned by everyone else it returns, as `@handle` (their
   * `handle`, else their email before the @). Their email is kept on the server for alerts and
   * never shown on comments.
   */
  auth?: (request: Request) => User | null | Promise<User | null>;
  /**
   * Visitors without an account comment under a name: `POST /me { name, tint? }` signs them in
   * with a random id, kept in a cookie signed with `secret`. Alongside `auth`, it's for whoever
   * your sign-in doesn't know.
   */
  guests?: boolean | { cookie?: string; maxAgeDays?: number; tints?: string[] };
  /** Signs the guest cookie and keys IP hashes. 32+ characters; keep it out of the code. */
  secret?: string;
  /**
   * `GET /admin?key=…` signs that browser in as an admin (with `guests`): for a site whose only
   * account is its owner. Then it goes to `adminRedirect` ("/").
   */
  adminKey?: string;
  adminName?: string;
  adminRedirect?: string;
  /** `Authorization: Bearer <token>` signs a request in as the agent (`dogear mcp`). */
  agentToken?: string;
  agentName?: string;
  /**
   * Whether this person may see comments on this page (null: signed out). Checked on every read
   * and write, and `?all=1` keeps only what passes; for someone @mentioned, it's asked about them
   * as your `auth` (or `directory`) describes them (id, name, email, handle, admin). `request` is
   * the one being answered when the question is about whoever sent it (to read a cookie of your
   * own, say), and absent when it's about someone mentioned. Default: everyone sees everything.
   */
  canSee?: (user: User | null, page: string, request?: Request) => boolean | Promise<boolean>;
  /**
   * Who can be @mentioned, from your own records rather than Dogear's: `list` for the @ list,
   * `find` for a handle that isn't in it (someone who has never signed in, say). With it, Dogear
   * keeps no people table of its own. Default: everyone `auth` has returned, remembered by the store.
   */
  directory?: Directory;
  /**
   * Who may delete this comment (deleting a thread's first comment deletes its replies). Default:
   * its author, or an admin. The agent never deletes, whatever this says.
   */
  deletable?: (user: User, comment: Comment) => boolean;
  /**
   * Runs work after the response is sent, so nobody waits for it: Next's `after` from
   * "next/server", or your platform's `waitUntil`. Default: starts it at once and doesn't wait,
   * which a server that stops after each response may cut short.
   */
  defer?: (task: () => Promise<void>) => void;
  /**
   * After a comment is saved, through `defer`: send alerts, ask an agent, count it. What throws is
   * passed to `onError`; the comment stays saved.
   */
  onCreated?: (event: Created) => void | Promise<void>;
  /**
   * Who hears about each new comment, after the response: `webhook({ url })` posts it to your
   * URL, or a `Notifier` of your own messages whoever was @mentioned. Each runs
   * on its own; what one throws goes to `onError`.
   */
  notify?: Notifier | Notifier[];
  /**
   * An assistant that answers threads in the thread itself, as itself: an AI teammate with your
   * docs or data behind it. Its replies are labelled as AI. It's in the @ list, and runs through
   * `defer`, after the response.
   */
  assistant?: Assistant;
  /** The query parameter a link to a thread uses, for `Created.link`: `?dogear=<id>` by default. */
  linkParam?: string;
  /**
   * Checks a comment, an edit or a guest's name before it's saved. `{ ok: false, message }` turns
   * it away with a 422, and the layer shows `message` to the writer and keeps their text.
   * Admins and the agent aren't checked.
   */
  moderate?: (
    text: string,
    kind: "comment" | "name",
    user: User | null,
  ) => Promise<{ ok: true } | { ok: false; message?: string }>;
  /**
   * New comments per person and per IP (hashed). Default: on with guests (5 in 10 minutes each,
   * 20 an hour per IP), off without. Admins and the agent aren't limited.
   */
  limits?:
    | false
    | { person?: { count: number; minutes: number }; ip?: { count: number; minutes: number } };
  /**
   * Who may resolve or reopen a thread: "anyone" who can comment, or its "authors" (with admins
   * and the agent). Default: "authors" with guests and no `auth`, else "anyone".
   */
  resolvers?: "anyone" | "authors";
  /** Called with whatever made a request answer 503. Default: console.error. */
  onError?: (error: unknown) => void;
  /**
   * Advanced: sign someone in on `POST /me` yourself, in place of guest cookies (`dogear serve` uses
   * it). Gets the cleaned name and tint.
   */
  join?: (request: Request, name: string, tint: string | null) => Promise<User>;
};

export type DogearHandler = (request: Request) => Promise<Response>;

/** People to @mention, from your own records (`DogearOptions.directory`). */
export type Directory = {
  /** Everyone who can be @mentioned: the @ list, and who a handle in a comment names. */
  list(): Promise<Known[]>;
  /** Someone by handle (lowercase) who isn't in `list`, or null: who has never signed in, say. */
  find?(handle: string): Promise<Known | null>;
};

/** An assistant that answers threads (`DogearOptions.assistant`). */
export type Assistant = {
  /** As it's shown: "Scout". */
  name: string;
  /** How it's @mentioned. Default: its name, lowercased, spaces as dashes. */
  handle?: string;
  /** Other @handles that call it too, e.g. `["claude"]`. */
  aliases?: string[];
  /** Its author id on comments. Default: `assistant:<handle>`. */
  id?: string;
  avatar?: string;
  /**
   * "threads" (the default): every new thread, and any reply that @mentions it. "mentions": only
   * comments that @mention it.
   */
  answers?: "threads" | "mentions";
  /** Decide for yourself instead of `answers`. Never asked about its own comments. */
  wants?: (comment: Comment, thread: Comment[]) => boolean;
  /**
   * Its answer to the thread (oldest first, the new comment last), or null to stay quiet. Longer
   * than 2000 characters is cut. Throwing goes to `onError`.
   */
  answer: (thread: Comment[], context: { link: string }) => Promise<string | null | undefined>;
  /** The most it says in one thread. Default: 5. */
  maxReplies?: number;
};

/** A comment just saved, for `onCreated`. */
export type Created = {
  comment: Comment;
  /** Its thread, oldest first: the first comment and every reply, this one included. */
  thread: Comment[];
  /** Who wrote it, as your sign-in described them (with `email`, if it gave one). */
  author: User;
  /**
   * Who it @mentions and can open the page, as your records describe them, emails included: who
   * to alert. Never the author.
   */
  mentioned: Known[];
  /** A link that opens its thread on its page: this site, the page, `?dogear=<thread id>`. */
  link: string;
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The most `GET /mentions` answers: the newest. */
const MENTIONS_MAX = 50;
const DEFAULT_LIMITS = { person: { count: 5, minutes: 10 }, ip: { count: 20, minutes: 60 } };

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

function same(given: string | null | undefined, expected: string | undefined) {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return undefined;
}

/** Only what a `User` is, whatever else a sign-in hands over. */
function asAuthor(user: User): User {
  return {
    id: user.id,
    name: user.name,
    ...(user.avatar ? { avatar: user.avatar } : {}),
    ...(user.tint ? { tint: user.tint } : {}),
    ...(user.admin ? { admin: true } : {}),
    ...(user.agent ? { agent: true } : {}),
  };
}

/** An assistant, its defaults filled in. */
function assistantOf(given: Assistant) {
  const handle = (given.handle ?? given.name.trim().toLowerCase().replace(/\s+/g, "-")).toLowerCase();
  const handles = new Set([handle, ...(given.aliases ?? []).map((a) => a.toLowerCase())]);
  const answers = given.answers ?? "threads";
  const user: User = {
    id: given.id ?? `assistant:${handle}`,
    name: given.name,
    agent: true,
    ...(given.avatar ? { avatar: given.avatar } : {}),
  };
  const calls = (comment: Comment) => mentionedHandles(comment.body).some((h) => handles.has(h));
  return {
    user,
    handles,
    maxReplies: given.maxReplies ?? 5,
    answer: given.answer,
    /** As the @ list shows it, with what it answers, so the layer can say it's reading. */
    person: {
      id: user.id,
      name: user.name,
      handle,
      ...(given.avatar ? { avatar: given.avatar } : {}),
      agent: true,
      answers: given.wants ? "mentions" : answers,
    } satisfies Person,
    wants: (comment: Comment, thread: Comment[]) =>
      !comment.author.agent &&
      (given.wants
        ? given.wants(comment, thread)
        : calls(comment) || (answers === "threads" && comment.parentId === null)),
  };
}

export function createDogear(options: DogearOptions): DogearHandler {
  const { store, auth, secret, canSee, moderate } = options;
  const base = (options.basePath ?? "/api/comments").replace(/\/$/, "");
  const guests = options.guests ? (options.guests === true ? {} : options.guests) : null;
  const cookie = guests?.cookie ?? "dogear_user";
  // Guests from before the rename to Dogear still carry `inkd_user`: read it until it expires.
  const oldCookie = guests?.cookie ? null : "inkd_user";
  const maxAge = (guests?.maxAgeDays ?? 365) * 24 * 60 * 60;
  const agent: User = { id: "agent", name: options.agentName ?? "Agent", agent: true };
  const admin: User = { id: "admin", name: options.adminName ?? "Admin", admin: true };
  const assistant = options.assistant ? assistantOf(options.assistant) : null;
  const limits =
    options.limits === false
      ? null
      : options.limits ?? (guests && !options.join ? DEFAULT_LIMITS : null);
  const resolvers = options.resolvers ?? (guests && !auth ? "authors" : "anyone");
  const onError = options.onError ?? ((error: unknown) => console.error("dogear:", error));
  const linkParam = options.linkParam ?? "dogear";
  const notifiers = options.notify ? [options.notify].flat() : [];
  const directory: Directory = options.directory ?? { list: () => store.people() };
  /** Work for after the response; whatever it throws is reported, and goes no further. */
  const later = (task: () => Promise<void>) => {
    const run = () => task().catch(onError);
    if (options.defer) options.defer(run);
    else void run();
  };

  if ((guests || options.adminKey) && !options.join && (!secret || secret.length < 32)) {
    throw new Error("dogear: guests and adminKey need a `secret` of 32+ characters (e.g. DOGEAR_SECRET)");
  }

  const sign = (payload: string) => createHmac("sha256", secret!).update(payload).digest("base64url");
  const seal = (user: User) => {
    const payload = Buffer.from(JSON.stringify(user)).toString("base64url");
    return `${payload}.${sign(payload)}`;
  };
  const unseal = (value: string | undefined): User | null => {
    if (!value || !secret) return null;
    const [payload, signature] = value.split(".");
    if (!payload || !signature || !same(signature, sign(payload))) return null;
    try {
      const user = JSON.parse(Buffer.from(payload, "base64url").toString()) as User;
      return typeof user.id === "string" && typeof user.name === "string" ? user : null;
    } catch {
      return null;
    }
  };
  const setCookie = (request: Request, user: User) =>
    [
      `${cookie}=${seal(user)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${maxAge}`,
      ...(new URL(request.url).protocol === "https:" ? ["Secure"] : []),
    ].join("; ");

  /** A keyed hash of the caller's IP, for limits: the IP itself is never stored. */
  const ipHash = (request: Request) => {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    return createHash("sha256").update(`${secret ?? "dogear"}:${ip}`).digest("hex").slice(0, 32);
  };

  /** Users who came from your sign-in, not a cookie of ours. */
  const known = new WeakSet<User>();

  /**
   * Who is asking: the agent (by token), your sign-in, then a guest's or the admin's cookie. Any
   * other bearer token is refused, never taken as whoever the cookie says.
   */
  async function who(request: Request): Promise<User | null> {
    const header = request.headers.get("authorization");
    const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (bearer !== null) {
      if (same(bearer, options.agentToken)) return agent;
      throw new HttpError(401, "wrong token");
    }
    const signedIn = auth ? await auth(request) : null;
    if (signedIn) {
      const user: User = {
        ...asAuthor(signedIn),
        ...(signedIn.email ? { email: signedIn.email } : {}),
        handle: handleOf(signedIn),
      };
      known.add(user);
      // With a directory of your own, the people are yours to keep.
      if (!options.directory) await remember(user);
      return user;
    }
    return unseal(readCookie(request, cookie)) ?? (oldCookie ? unseal(readCookie(request, oldCookie)) : null);
  }

  /** What was last written for each person, and when: a write when it changes, or every 10 minutes. */
  const remembered = new Map<string, { key: string; at: number }>();
  async function remember(user: User) {
    const person: Known = {
      id: user.id,
      name: user.name,
      handle: user.handle!,
      ...(user.avatar ? { avatar: user.avatar } : {}),
      ...(user.email ? { email: user.email } : {}),
      ...(user.admin ? { admin: true } : {}),
    };
    const key = JSON.stringify(person);
    const last = remembered.get(person.id);
    if (last && last.key === key && Date.now() - last.at < 10 * 60_000) return;
    remembered.set(person.id, { key, at: Date.now() });
    await store.remember(person);
  }

  /**
   * Who a text @mentions: people in the directory, by handle, the writer aside, who can open the
   * page. Those who can't are `skipped` (by name), so the writer can be told. Only someone your
   * sign-in knows can mention anyone: a guest can't ping your team. `people` are the ones
   * mentioned as your records have them, emails included, for alerts.
   */
  async function mentionsIn(user: User, body: string, page: string) {
    const mentions: Mention[] = [];
    const skipped: string[] = [];
    const people: Known[] = [];
    const handles = mentionedHandles(body);
    // The assistant may mention people too: it answers for your team.
    const trusted = known.has(user) || (assistant !== null && user.id === assistant.user.id);
    if (!trusted || handles.length === 0) return { mentions, skipped, people };
    const byHandle = new Map((await directory.list()).map((p) => [p.handle.toLowerCase(), p]));
    for (const handle of handles) {
      // The assistant is drawn as itself, and never alerted: it answers in the thread.
      if (assistant?.handles.has(handle)) {
        mentions.push({ id: assistant.user.id, name: assistant.user.name, handle });
        continue;
      }
      const person = byHandle.get(handle) ?? (directory.find ? await directory.find(handle) : null);
      if (!person || person.id === user.id) continue;
      // Asked about them as your records describe them.
      const { avatar: _, ...them } = person;
      if (await sees(them, page)) {
        mentions.push({ id: person.id, name: person.name, handle: person.handle });
        people.push(person);
      } else skipped.push(person.name);
    }
    return { mentions, skipped, people };
  }

  /** The assistant's turn, after the response: if it wants to, and hasn't said enough already. */
  async function answer(comment: Comment, link: string) {
    if (!assistant) return;
    const rootId = comment.parentId ?? comment.id;
    const thread = (await store.list(pathOf(comment.page))).filter((c) => (c.parentId ?? c.id) === rootId);
    if (!thread.some((c) => c.id === comment.id)) thread.push(comment);
    if (!assistant.wants(comment, thread)) return;
    if (thread.at(-1)?.author.id === assistant.user.id) return;
    if (thread.filter((c) => c.author.id === assistant.user.id).length >= assistant.maxReplies) return;
    const said = (await assistant.answer(thread, { link }))?.trim();
    if (!said) return;
    const body = cleanBody(said.length > MAX_BODY ? `${said.slice(0, MAX_BODY - 1)}…` : said);
    // The thread may have gone while it thought.
    if (!body || !(await store.get(rootId))) return;
    const { mentions } = await mentionsIn(assistant.user, body, thread[0].page);
    await store.insert(
      {
        id: randomUUID(),
        page: thread[0].page,
        parentId: rootId,
        body,
        author: assistant.user,
        anchor: null,
        createdAt: Date.now(),
        editedAt: null,
        resolved: false,
        ...(mentions.length ? { mentions } : {}),
      },
      {},
    );
  }

  const sees = async (user: User | null, page: string, request?: Request) =>
    canSee ? canSee(user, page, request) : true;

  async function check(user: User | null, text: string, kind: "comment" | "name") {
    if (!moderate || user?.admin || user?.agent) return;
    const verdict = await moderate(text, kind, user);
    if (!verdict.ok) {
      throw new HttpError(
        422,
        verdict.message ??
          (kind === "name" ? "Let's keep names kind. Try another one." : "Let's keep it kind. Try rewording that."),
      );
    }
  }

  async function body(request: Request): Promise<Record<string, unknown> | null> {
    const value: unknown = await request.json().catch(() => {
      throw new HttpError(400, "bad json");
    });
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  }

  let ready: Promise<void> | null = null;
  const init = () => {
    ready ??= (store.init?.() ?? Promise.resolve()).catch((error: unknown) => {
      ready = null; // try again on the next request
      throw error;
    });
    return ready;
  };

  async function route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== base && !url.pathname.startsWith(`${base}/`)) throw new HttpError(404, "not found");
    const rest = url.pathname
      .slice(base.length)
      .split("/")
      .filter(Boolean)
      .map((part) => decodeURIComponent(part));
    const method = request.method.toUpperCase();
    await init();
    const user = await who(request);

    if (rest[0] === "me" && rest.length === 1) {
      if (method === "GET") return user ? json(user) : json({ error: "signed out" }, 401);
      if (method === "POST") return join(request, user);
    }
    if (rest[0] === "admin" && rest.length === 1 && method === "GET") {
      if (!options.adminKey || !same(url.searchParams.get("key"), options.adminKey)) {
        throw new HttpError(403, "wrong key");
      }
      return new Response(null, {
        status: 303,
        headers: {
          location: new URL(options.adminRedirect ?? "/", request.url).href,
          "set-cookie": setCookie(request, admin),
        },
      });
    }

    if (rest[0] === "mentions" && rest.length === 1 && method === "GET") {
      // Where you were @mentioned, on pages you can still open: for "Asha mentioned you".
      if (!user) throw new HttpError(401, "sign in first");
      if (!known.has(user)) return json([]);
      const found = store.mentioning
        ? await store.mentioning(user.id, MENTIONS_MAX * 2)
        : (await store.all()).filter((c) => c.mentions?.some((m) => m.id === user.id)).reverse();
      const seen = new Map<string, boolean>();
      const visible: Comment[] = [];
      for (const c of found) {
        if (c.author.id === user.id || !c.mentions?.some((m) => m.id === user.id)) continue;
        if (!seen.has(c.page)) seen.set(c.page, await sees(user, c.page, request));
        if (seen.get(c.page)) visible.push(withoutState(c));
        if (visible.length === MENTIONS_MAX) break;
      }
      return json(visible);
    }

    if (rest[0] === "people" && rest.length === 1 && method === "GET") {
      // The @ list, for people your sign-in knows. Never their emails.
      if (!user || !known.has(user)) throw new HttpError(403, "sign in to mention people");
      return json(
        (await directory.list())
          .filter((p) => p.id !== user.id && p.id !== assistant?.user.id)
          .map(({ id, name, handle, avatar }): Person => ({ id, name, handle, ...(avatar ? { avatar } : {}) }))
          .concat(assistant ? [assistant.person] : []),
      );
    }

    if (rest.length === 0 && method === "GET") {
      if (url.searchParams.get("all") === "1") {
        const seen = new Map<string, boolean>();
        const visible: Comment[] = [];
        for (const c of await store.all()) {
          if (!seen.has(c.page)) seen.set(c.page, await sees(user, c.page, request));
          if (seen.get(c.page)) visible.push(withoutState(c));
        }
        return json(visible);
      }
      const path = url.searchParams.get("path");
      if (!path?.startsWith("/") || path.length > 300 || path.includes("?")) {
        throw new HttpError(400, "path required");
      }
      if (!(await sees(user, path, request))) throw new HttpError(403, "no access");
      return json(await store.list(path));
    }

    if (rest.length === 0 && method === "POST") return create(request, user);

    const id = rest[0];
    if (!id || id.length > 100) throw new HttpError(404, "not found");
    const reacting = rest.length === 2 && rest[1] === "reactions" && method === "POST";
    if (rest.length !== 1 && !reacting) throw new HttpError(404, "not found");
    const comment = await store.get(id);
    if (!comment || !(await sees(user, comment.page, request))) throw new HttpError(404, "not found");
    if (!user) throw new HttpError(401, "sign in first");

    if (reacting) {
      // One emoji (not one of the rude few), and no moderation call: each person holds one of
      // each, on at most MAX_REACTIONS kinds.
      const emoji = cleanReaction((await body(request))?.emoji);
      if (!emoji) throw new HttpError(400, "not an emoji");
      if (!roomForReaction(comment.reactions, emoji)) {
        throw new HttpError(422, "This comment has all the kinds of reaction it can take.");
      }
      const next = await store.react(id, emoji, user.id);
      if (!next) throw new HttpError(404, "not found");
      return json(next);
    }
    if (method === "PATCH") {
      const patch = await body(request);
      if (patch && "body" in patch) {
        const text = cleanBody(patch.body);
        if (text === null) throw new HttpError(400, "bad comment");
        if (comment.author.id !== user.id) throw new HttpError(403, "not yours");
        await check(user, text, "comment");
        const { mentions } = await mentionsIn(user, text, comment.page);
        return json(await store.edit(id, { body: text, editedAt: Date.now(), mentions }));
      }
      if (patch && typeof patch.resolved === "boolean") {
        if (comment.parentId !== null) throw new HttpError(400, "resolve the thread, not a reply");
        if (resolvers === "authors" && comment.author.id !== user.id && !user.admin && !user.agent) {
          throw new HttpError(403, "not yours");
        }
        return json(await store.resolve(id, patch.resolved));
      }
      throw new HttpError(400, "bad request");
    }
    if (method === "DELETE") {
      // The agent never deletes: threads and their history belong to the people who wrote them.
      const allowed = options.deletable
        ? options.deletable(user, comment)
        : comment.author.id === user.id || Boolean(user.admin);
      if (user.agent || !allowed) throw new HttpError(403, "not yours");
      return json({ deleted: await store.remove(id) });
    }
    throw new HttpError(405, "method not allowed");
  }

  async function join(request: Request, user: User | null): Promise<Response> {
    const given = await body(request);
    const name = cleanName(given?.name);
    if (!name) throw new HttpError(400, "a name is 1 to 40 characters");
    let tint = cleanTint(given?.tint);
    if (tint && guests?.tints && !guests.tints.includes(tint)) tint = null;
    if (options.join) return json(await options.join(request, name, tint));
    // Someone your sign-in knows, the admin and the agent stay who they are.
    if (user && (user.admin || user.agent || known.has(user))) return json(user);
    if (!guests) throw new HttpError(404, "guests are off");
    await check(user, name, "name");
    // A guest keeps their id (and their avatar, unless they picked another) and changes their name.
    const guest: User = {
      id: user?.id ?? randomUUID(),
      name,
      ...((tint ?? user?.tint) ? { tint: (tint ?? user?.tint)! } : {}),
    };
    return json(guest, 200, { "set-cookie": setCookie(request, guest) });
  }

  async function create(request: Request, user: User | null): Promise<Response> {
    if (!user) throw new HttpError(401, "sign in first");
    const input = validateNew(await body(request));
    if (!input) throw new HttpError(400, "bad comment");
    if (!(await sees(user, input.page, request))) throw new HttpError(403, "no access");
    if (input.parentId) {
      const parent = await store.get(input.parentId);
      if (!parent || parent.parentId !== null || !(await sees(user, parent.page, request))) {
        throw new HttpError(404, "no such thread");
      }
    }
    const ip = ipHash(request);
    if (limits && !user.admin && !user.agent) {
      const now = Date.now();
      const { person, ip: perIp } = limits;
      if (
        (person && (await store.count({ authorId: user.id }, now - person.minutes * 60_000)) >= person.count) ||
        (perIp && (await store.count({ ip }, now - perIp.minutes * 60_000)) >= perIp.count)
      ) {
        throw new HttpError(429, "too many comments; try again in a few minutes");
      }
    }
    // Last, so a request that's turned away anyway never costs a check.
    await check(user, input.body, "comment");
    const { mentions, skipped, people } = await mentionsIn(user, input.body, input.page);
    const comment: Comment = {
      ...input,
      id: randomUUID(),
      author: asAuthor(user),
      createdAt: Date.now(),
      editedAt: null,
      resolved: false,
      ...(mentions.length ? { mentions } : {}),
    };
    const saved = await store.insert(comment, { ip });
    const hooks = [...(options.onCreated ? [options.onCreated] : []), ...notifiers];
    if (hooks.length) {
      const rootId = saved.parentId ?? saved.id;
      const url = new URL(saved.page, new URL(request.url).origin);
      url.searchParams.set(linkParam, rootId);
      later(async () => {
        const thread = (await store.list(pathOf(saved.page))).filter((c) => (c.parentId ?? c.id) === rootId);
        if (!thread.some((c) => c.id === saved.id)) thread.push(saved);
        const event: Created = { comment: saved, thread, author: user, mentioned: people, link: url.href };
        // Each on its own: one that fails doesn't stop the rest.
        for (const outcome of await Promise.allSettled(hooks.map(async (hook) => hook(event)))) {
          if (outcome.status === "rejected") onError(outcome.reason);
        }
      });
    }
    if (assistant && !user.agent) {
      const link = new URL(saved.page, new URL(request.url).origin);
      link.searchParams.set(linkParam, saved.parentId ?? saved.id);
      later(() => answer(saved, link.href));
    }
    // Who was mentioned but can't open the page: the writer is told, and nothing is sent to them.
    return json(skipped.length ? { ...saved, skipped } : saved, 201);
  }

  return async (request) => {
    try {
      return await route(request);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      onError(error);
      return json({ error: "comments unavailable" }, 503);
    }
  };
}
