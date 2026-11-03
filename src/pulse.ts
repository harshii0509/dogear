import { pathOf, type Comment, type User } from "./model";

/**
 * How feedback is going, from the comments themselves: what's open, what moved this week, how
 * long a thread waits for someone to answer, and where the feedback gathers. The tray's Pulse
 * view and `dogear mcp`'s `dogear_pulse` both read this, so they always agree. No DOM, and
 * nothing leaves your backend: it's arithmetic over what `list` or `listAll` already returned.
 */

const DAY = 86_400_000;

export type Pulse = {
  /** When this was worked out, epoch milliseconds. Every window below ends here. */
  now: number;
  /** Threads open now, and resolved now, whenever they were started. */
  open: number;
  resolved: number;
  /** Threads started in the last 7 days, and in the 7 before. */
  started: { thisWeek: number; lastWeek: number };
  /** Comments (threads and replies) per day, oldest day first: 14 days of 24 hours, ending now. */
  daily: number[];
  /** Of each day's comments in `daily`, how many started a thread. The rest are replies. */
  dailyThreads: number[];
  /**
   * How long a thread waits for its first reply from someone other than whoever started it:
   * the median over threads started in the last 30 days that have one, and how many that is.
   */
  firstReply: { median: number | null; threads: number };
  /** Open threads nobody else has answered yet, the longest-waiting first, up to `top`. */
  waiting: Comment[];
  /** How many open threads are waiting, all of them, not just those in `waiting`. */
  waitingTotal: number;
  /** The pages with the most open threads, most first, up to 3. */
  pages: { path: string; open: number }[];
  /** The elements with the most threads on them, open or not, up to 3. */
  spots: { path: string; label: string; threads: number }[];
  /** Whoever commented in the last 7 days, most comments first. */
  people: { user: User; comments: number }[];
  /** Whoever commented in the 14 days of `daily`, most comments first, with their share of each day. */
  contributors: Contributor[];
};

export type Contributor = {
  user: User;
  /** In the 14 days, and in the last 7 of them. */
  comments: number;
  thisWeek: number;
  /** Per day, oldest first, on the same days as `Pulse.daily`. */
  daily: number[];
  /** Their latest comment, epoch milliseconds. */
  lastAt: number;
};

type Options = {
  /** Epoch milliseconds. Default: `Date.now()`. */
  now?: number;
  /** How many rows `waiting` keeps. Default 3. */
  top?: number;
};

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Most first; a tie falls back to the name, so the order never shuffles between looks. */
const byCount = <T>(count: (t: T) => number, name: (t: T) => string) => (a: T, b: T) =>
  count(b) - count(a) || name(a).localeCompare(name(b));

export function pulseOf(comments: Comment[], { now = Date.now(), top = 3 }: Options = {}): Pulse {
  const roots = comments.filter((c) => c.parentId === null);
  const replies = new Map<string, Comment[]>();
  for (const c of comments) {
    if (c.parentId !== null) replies.set(c.parentId, [...(replies.get(c.parentId) ?? []), c]);
  }
  /** The first reply that isn't the starter talking to themselves. */
  const answer = (root: Comment) =>
    (replies.get(root.id) ?? [])
      .filter((r) => r.author.id !== root.author.id)
      .reduce<Comment | null>((first, r) => (!first || r.createdAt < first.createdAt ? r : first), null);

  const open = roots.filter((r) => !r.resolved);
  /** Started in the 7 days that end `weeksAgo` weeks before now. */
  const startedIn = (weeksAgo: number) =>
    roots.filter((r) => {
      const end = now - weeksAgo * 7 * DAY;
      return r.createdAt > end - 7 * DAY && r.createdAt <= end;
    }).length;

  const daily = Array.from({ length: 14 }, (_, i) => {
    const end = now - (13 - i) * DAY;
    return comments.filter((c) => c.createdAt > end - DAY && c.createdAt <= end).length;
  });
  /** Which of those 14 days a time falls in, or -1 outside them. */
  const dayOf = (time: number) => {
    const back = Math.floor((now - time) / DAY);
    return back >= 0 && back < 14 ? 13 - back : -1;
  };
  const dailyThreads = daily.map(() => 0);
  const contributors = new Map<string, Contributor>();
  for (const c of comments) {
    const day = dayOf(c.createdAt);
    if (day < 0) continue;
    if (c.parentId === null) dailyThreads[day] += 1;
    const who =
      contributors.get(c.author.id) ??
      { user: c.author, comments: 0, thisWeek: 0, daily: daily.map(() => 0), lastAt: c.createdAt };
    who.comments += 1;
    if (day >= 7) who.thisWeek += 1;
    who.daily[day] += 1;
    who.lastAt = Math.max(who.lastAt, c.createdAt);
    contributors.set(c.author.id, who);
  }

  const waits = roots
    .filter((r) => r.createdAt > now - 30 * DAY)
    .flatMap((r) => {
      const first = answer(r);
      return first ? [Math.max(0, first.createdAt - r.createdAt)] : [];
    });

  const unanswered = open
    .filter((r) => !answer(r))
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));

  const pages = new Map<string, number>();
  for (const r of open) pages.set(pathOf(r.page), (pages.get(pathOf(r.page)) ?? 0) + 1);

  const spots = new Map<string, { path: string; label: string; threads: number }>();
  for (const r of roots) {
    const label = r.anchor?.label?.trim();
    if (!label) continue;
    const key = `${pathOf(r.page)}\n${label}`;
    const spot = spots.get(key) ?? { path: pathOf(r.page), label, threads: 0 };
    spot.threads += 1;
    spots.set(key, spot);
  }

  const people = new Map<string, { user: User; comments: number }>();
  for (const c of comments) {
    if (c.createdAt <= now - 7 * DAY || c.createdAt > now) continue;
    const person = people.get(c.author.id) ?? { user: c.author, comments: 0 };
    person.comments += 1;
    people.set(c.author.id, person);
  }

  return {
    now,
    open: open.length,
    resolved: roots.length - open.length,
    started: { thisWeek: startedIn(0), lastWeek: startedIn(1) },
    daily,
    dailyThreads,
    firstReply: { median: median(waits), threads: waits.length },
    waiting: unanswered.slice(0, top),
    waitingTotal: unanswered.length,
    pages: [...pages]
      .map(([path, open]) => ({ path, open }))
      .sort(byCount((p) => p.open, (p) => p.path))
      .slice(0, 3),
    spots: [...spots.values()]
      .sort(byCount((s) => s.threads, (s) => `${s.path} ${s.label}`))
      .slice(0, 3),
    people: [...people.values()].sort(byCount((p) => p.comments, (p) => p.user.name)),
    contributors: [...contributors.values()].sort(byCount((p) => p.comments, (p) => p.user.name)),
  };
}
