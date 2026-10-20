import {
  cleanBody,
  cleanList,
  cleanName,
  cleanReaction,
  roomForReaction,
  cleanTint,
  newComment,
  pathOf,
  toggleReaction,
  type Comment,
  type NewComment,
  type Person,
  type User,
} from "./model";

/**
 * Everything the layer needs from a backend. Implement it against anything: Supabase, Firebase,
 * Postgres behind your own route, a paid service, a spreadsheet. `docs/contract.md` has the rules
 * every implementation must keep; the setup prompt in the README has your coding agent write one.
 *
 * Throw from any method to fail it; the layer rolls back and says so. Throwing from `me` or from
 * the first `list` hides the layer (not signed in, not configured), and so do two looks in a row
 * that throw later on: when the backend is down, the layer is gone, and it comes back by itself.
 */
export type Adapter = {
  /** Whoever is signed in, or null: the layer hides, or with `join` shows the threads read-only. */
  me(): Promise<User | null>;
  /** Every comment whose page has this path, whatever its query string, oldest first. */
  list(path: string): Promise<Comment[]>;
  /**
   * Store it signed as the current user. The backend, not the browser, decides the author, and
   * who its @handles are (`mentions`). `skipped` names anyone mentioned who can't open the page,
   * so the writer can be told they won't see it.
   */
  create(input: NewComment): Promise<Comment & { skipped?: string[] }>;
  /** `{ body }`: the author only. `{ resolved }`: anyone who can see the page. */
  update(
    id: string,
    patch: { body: string } | { resolved: boolean },
  ): Promise<Comment>;
  /** The author or an admin. Deleting a thread's first comment deletes its replies. Returns every id gone. */
  remove(id: string): Promise<string[]>;
  /**
   * Optional push. Call `onChange` whenever comments on `path` may have changed; return an
   * unsubscribe. Without it the layer polls `list` every 3s while comment mode is on.
   */
  subscribe?(path: string, onChange: () => void): () => void;
  /**
   * Optional: every comment on every page, oldest first. The tray reads it for other pages'
   * threads, and `dogear mcp` so an agent can see all open feedback at once. Without it, the tray
   * shows this page only and agents ask page by page.
   */
  listAll?(): Promise<Comment[]>;
  /**
   * Optional, for public pages: sign a visitor in as a guest under this name (1–40 characters).
   * With it, a signed-out visitor sees the threads and is asked for a name the first time they
   * write. The backend mints the id and keeps the session; never take an id from the browser.
   * `tint` is the avatar they picked, when the page offers some (`avatars`): keep it as `tint`
   * on the user if it's one you allow (`cleanTint`, then your own list).
   */
  join?(name: string, tint?: string): Promise<User>;
  /**
   * Optional: the current user's reaction on a comment, toggled (added, or taken back if they
   * already had it), and the comment as it is now. `toggleReaction` does the toggling. Without
   * it, the layer offers no reactions.
   */
  react?(id: string, emoji: string): Promise<Comment>;
  /**
   * Optional: who can be @mentioned, for the `@` list as someone types. People who have signed
   * in, without whoever is asking. Without it (or when it fails), typing @ does nothing special.
   */
  people?(): Promise<Person[]>;
  /**
   * Optional: comments that @mention the current user, on pages they can open, not their own,
   * newest first, without `state`. The layer polls it to say "Alex mentioned you", wherever they
   * are on the site. Without it, mentions are only seen where they were left.
   */
  mentions?(): Promise<Comment[]>;
};

/**
 * Comments in this browser's localStorage: no backend, no sign-in. For trying it out, a solo
 * review, or a static demo. Nobody else sees them. `user: null` starts as a guest who is asked
 * for a name, to try the public-page flow.
 */
export function localAdapter({
  user: given = { id: "local", name: "You" },
  key = "dogear",
  storage = globalThis.localStorage as Storage | undefined,
}: {
  user?: User | null;
  key?: string;
  storage?: Pick<Storage, "getItem" | "setItem">;
} = {}): Adapter {
  // ponytail: the whole list is read and written on every call; fine for hundreds, not millions.
  const read = (): Comment[] => {
    try {
      return JSON.parse(storage?.getItem(key) ?? "[]") as Comment[];
    } catch {
      return [];
    }
  };
  const write = (all: Comment[]) => storage?.setItem(key, JSON.stringify(all));
  const guestKey = `${key}:me`;
  const readGuest = (): User | null => {
    try {
      return JSON.parse(storage?.getItem(guestKey) ?? "null") as User | null;
    } catch {
      return null;
    }
  };
  let user = given ?? readGuest();
  const signedIn = () => {
    if (!user) throw new Error("not signed in");
    return user;
  };
  const find = (all: Comment[], id: string) => {
    const comment = all.find((c) => c.id === id);
    if (!comment) throw new Error("not found");
    return comment;
  };
  const adapter: Adapter = {
    me: async () => user,
    list: async (path) => read().filter((c) => pathOf(c.page) === path),
    listAll: async () => read(),
    async create(input) {
      const comment = newComment(input, signedIn());
      write([...read(), comment]);
      return comment;
    },
    async update(id, patch) {
      const all = read();
      const comment = find(all, id);
      if ("body" in patch) {
        const body = cleanBody(patch.body);
        if (body === null || comment.author.id !== signedIn().id) throw new Error("not allowed");
        Object.assign(comment, { body, editedAt: Date.now() });
      } else {
        comment.resolved = patch.resolved;
      }
      write(all);
      return comment;
    },
    async remove(id) {
      const all = read();
      const me = signedIn();
      if (find(all, id).author.id !== me.id && !me.admin) throw new Error("not allowed");
      const gone = all.filter((c) => c.id === id || c.parentId === id).map((c) => c.id);
      write(all.filter((c) => !gone.includes(c.id)));
      return gone;
    },
    async react(id, emoji) {
      const clean = cleanReaction(emoji);
      if (clean === null) throw new Error("not an emoji");
      const all = read();
      const comment = find(all, id);
      if (!roomForReaction(comment.reactions, clean)) throw new Error("too many reactions");
      comment.reactions = toggleReaction(comment.reactions, clean, signedIn().id);
      write(all);
      return comment;
    },
  };
  if (given === null) {
    adapter.join = async (name, tint) => {
      const clean = cleanName(name);
      if (clean === null) throw new Error("bad name");
      const picked = cleanTint(tint);
      user = {
        id: user?.id ?? crypto.randomUUID(),
        name: clean,
        ...(picked ? { tint: picked } : {}),
      };
      storage?.setItem(guestKey, JSON.stringify(user));
      return user;
    };
  }
  return adapter;
}

/**
 * Speaks the REST shape in `docs/contract.md` to your own server:
 *
 *   GET    {endpoint}/me            → User (401 when signed out)
 *   POST   {endpoint}/me            { name } → User, signed in as a guest (optional; public pages)
 *   GET    {endpoint}?path=/x       → Comment[]
 *   GET    {endpoint}?all=1         → Comment[], every page (optional; for agents)
 *   POST   {endpoint}               NewComment → Comment
 *   PATCH  {endpoint}/{id}          { body } | { resolved } → Comment
 *   DELETE {endpoint}/{id}          → { deleted: string[] }
 *   POST   {endpoint}/{id}/reactions { emoji } → Comment, your reaction toggled (optional)
 *
 * Cookies go with every request (`credentials: "include"`), so your existing session is the auth.
 * Outside a browser (`dogear mcp`), pass `token` instead: it goes as `Authorization: Bearer`, and your
 * route maps it to an agent user (`docs/contract.md`, "Agent tokens"). `guests: true` adds `join`,
 * for a route that signs visitors in by name (`POST /me`).
 *
 * A request that takes longer than `timeout` ms (8s by default) fails, so a server that hangs
 * hides the layer instead of leaving it waiting. Only a 401 or 403 from `/me` means signed out;
 * any other failure there is the backend being down, and fails the look like any other call.
 */
export function httpAdapter(
  endpoint: string,
  {
    token,
    guests = false,
    timeout = 8_000,
    ...init
  }: RequestInit & { token?: string; guests?: boolean; timeout?: number } = {},
): Adapter {
  const base = endpoint.replace(/\/$/, "");
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const timer = AbortSignal.timeout(timeout);
    const response = await fetch(base + path, {
      credentials: "include",
      ...init,
      // AbortSignal.any is newer than timeout(); without it, the caller's signal wins.
      signal: init.signal
        ? (AbortSignal.any?.([init.signal, timer]) ?? init.signal)
        : timer,
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      // The route's own words, if it gave any (`{ error }`): a 422 shows them to the writer.
      const said = (await response.json().catch(() => null)) as { error?: unknown } | null;
      throw Object.assign(new Error(`dogear: ${method} ${response.status}`), {
        status: response.status,
        ...(typeof said?.error === "string" ? { reason: said.error } : {}),
      });
    }
    return response.json() as Promise<T>;
  }
  const adapter: Adapter = {
    me: () =>
      call<User>("GET", "/me").catch((error: { status?: number }) => {
        if (error.status === 401 || error.status === 403) return null;
        throw error;
      }),
    list: (path) => call("GET", `?path=${encodeURIComponent(path)}`),
    listAll: () => call("GET", "?all=1"),
    create: (input) => call("POST", "", input),
    update: (id, patch) => call("PATCH", `/${encodeURIComponent(id)}`, patch),
    remove: (id) =>
      call<{ deleted: string[] }>("DELETE", `/${encodeURIComponent(id)}`).then(
        (r) => r.deleted,
      ),
    react: (id, emoji) => call("POST", `/${encodeURIComponent(id)}/reactions`, { emoji }),
    // Nobody to mention (a guest, mentions off, an older backend): an empty list, not a failure.
    people: () => call<Person[]>("GET", "/people").then((list) => (Array.isArray(list) ? list : []), () => []),
    mentions: () => call<unknown>("GET", "/mentions").then(cleanList),
  };
  if (guests) adapter.join = (name, tint) => call("POST", "/me", tint ? { name, tint } : { name });
  return adapter;
}
