#!/usr/bin/env node
/**
 * `npm run pulse`: how Dogear is doing out in the world, from what npm and GitHub already publish.
 * Nothing is tracked: no pings from the package, no analytics. It reads npm's download counts,
 * the repo's stars, traffic, issues and releases (through `gh`, signed in as a maintainer, since
 * traffic is only shown to people who can push), and public repos whose package.json names us.
 *
 * GitHub keeps traffic for 14 days only, so each run appends its figures to `.pulse/history.jsonl`
 * (gitignored) and the report says what changed since the last run, and since a week ago.
 * `--json` prints the figures instead of the report. Never published: `files` is dist and docs.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE = "@harshi04/dogear";
const REPO = "harshii0509/dogear";
const OWNER = REPO.split("/")[0];
const DAY = 86_400_000;
const HISTORY = join(dirname(fileURLToPath(import.meta.url)), "..", ".pulse", "history.jsonl");

/** A source that fails says so in the report, rather than stopping the rest. */
const failed = [];
async function attempt(name, work) {
  try {
    return await work();
  } catch (error) {
    failed.push(`${name} (${error instanceof Error ? error.message.split("\n")[0] : error})`);
    return null;
  }
}

async function npm(path) {
  const response = await fetch(`https://api.npmjs.org${path}`);
  if (!response.ok) throw new Error(`npm said ${response.status}`);
  return response.json();
}

function gh(path, ...flags) {
  const out = execFileSync("gh", ["api", ...flags, path], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(out);
}

async function collect() {
  const daily = await attempt("npm downloads", async () =>
    (await npm(`/downloads/range/last-month/${PACKAGE}`)).downloads.map((d) => ({ day: d.day, n: d.downloads })),
  );
  const versions = await attempt("npm versions", async () =>
    (await npm(`/versions/${encodeURIComponent(PACKAGE)}/last-week`)).downloads,
  );
  const repo = await attempt("GitHub repo", () => gh(`repos/${REPO}`));
  const views = await attempt("GitHub visitors", () => gh(`repos/${REPO}/traffic/views`));
  const clones = await attempt("GitHub clones", () => gh(`repos/${REPO}/traffic/clones`));
  const referrers = await attempt("GitHub referrers", () => gh(`repos/${REPO}/traffic/popular/referrers`));
  const paths = await attempt("GitHub top pages", () => gh(`repos/${REPO}/traffic/popular/paths`));
  const prs = await attempt("GitHub pull requests", () => gh(`repos/${REPO}/pulls?state=open&per_page=100`));
  const release = await attempt("GitHub release", () => gh(`repos/${REPO}/releases/latest`));
  const users = await attempt("Who uses it", () =>
    gh("search/code", "-X", "GET", "-f", `q="${PACKAGE}" filename:package.json`, "-f", "per_page=100"),
  );

  const sum = (days) => (days ?? []).reduce((total, d) => total + d.n, 0);
  const lastDays = (from, to) => daily && daily.slice(daily.length - to, daily.length - from);
  const usedBy = users
    ? [...new Set(users.items.map((item) => item.repository.full_name))]
        .filter((name) => !name.startsWith(`${OWNER}/`))
        .sort()
    : null;
  return {
    at: new Date().toISOString(),
    npm: daily && {
      daily,
      thisWeek: sum(lastDays(0, 7)),
      lastWeek: sum(lastDays(7, 14)),
      month: sum(daily),
      versions,
    },
    github: repo && {
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      watchers: repo.subscribers_count,
      issues: repo.open_issues_count - (prs?.length ?? 0),
      prs: prs?.length ?? null,
      visitors: views && { unique: views.uniques, total: views.count },
      cloners: clones && { unique: clones.uniques, total: clones.count },
      referrers: referrers?.map((r) => ({ from: r.referrer, unique: r.uniques })) ?? null,
      paths: paths?.slice(0, 3).map((p) => ({ path: p.path, unique: p.uniques })) ?? null,
      release: release && { tag: release.tag_name, at: release.published_at },
    },
    usedBy,
  };
}

/* ── The report ─────────────────────────────────────────────────────────────────────────────── */

const BARS = "▁▂▃▄▅▆▇█";
const spark = (values) => {
  const top = Math.max(1, ...values);
  return values.map((v) => (v === 0 ? "▁" : BARS[Math.min(7, Math.ceil((v / top) * 7))])).join("");
};
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const daysSince = (iso) => Math.floor((Date.now() - Date.parse(iso)) / DAY);
const dateOf = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** "(+2)" against an earlier run, or nothing when there's no earlier figure or no change. */
const change = (now, before) =>
  typeof now === "number" && typeof before === "number" && now !== before
    ? ` (${now > before ? "+" : ""}${now - before})`
    : "";

function readHistory() {
  if (!existsSync(HISTORY)) return [];
  return readFileSync(HISTORY, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

/** The figures that are worth comparing between runs, by name. */
const figures = (p) => ({
  "installs this week": p.npm?.thisWeek,
  stars: p.github?.stars,
  forks: p.github?.forks,
  "unique visitors (14 days)": p.github?.visitors?.unique,
  "unique cloners (14 days)": p.github?.cloners?.unique,
  "open issues": p.github?.issues,
  "public repos using it": p.usedBy?.length,
});

function report(p, history) {
  const last = history.at(-1);
  const weekAgo = [...history].reverse().find((h) => Date.now() - Date.parse(h.at) >= 6 * DAY);
  const was = last ? figures(last) : {};
  const lines = [`Dogear pulse · ${dateOf(p.at)}`, ""];

  if (p.npm) {
    lines.push("npm installs, the last 30 days");
    lines.push(`  ${spark(p.npm.daily.map((d) => d.n))}  ${p.npm.month} in all`);
    lines.push(
      `  ${p.npm.thisWeek} this week${change(p.npm.thisWeek, was["installs this week"])}, ${p.npm.lastWeek} the week before`,
    );
    const versions = Object.entries(p.npm.versions ?? {})
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]);
    if (versions.length) lines.push(`  By version this week  ${versions.map(([v, n]) => `${v} ${n}`).join(" · ")}`);
    lines.push("");
  }

  const g = p.github;
  if (g) {
    lines.push("GitHub");
    lines.push(
      `  ${plural(g.stars, "star")}${change(g.stars, was.stars)} · ${plural(g.forks, "fork")}${change(g.forks, was.forks)} · ${plural(g.watchers, "watcher")}`,
    );
    if (g.visitors) {
      lines.push(
        `  ${plural(g.visitors.unique, "visitor")}${change(g.visitors.unique, was["unique visitors (14 days)"])} in 14 days, ${plural(g.visitors.total, "view")}`,
      );
    }
    if (g.cloners) {
      lines.push(
        `  ${plural(g.cloners.unique, "cloner")}${change(g.cloners.unique, was["unique cloners (14 days)"])} in 14 days, ${plural(g.cloners.total, "clone")}`,
      );
    }
    if (g.referrers?.length) lines.push(`  Came from  ${g.referrers.map((r) => `${r.from} ${r.unique}`).join(" · ")}`);
    if (g.paths?.length) lines.push(`  Read most  ${g.paths.map((r) => `${r.path.replace(`/${REPO}`, "") || "/"} ${r.unique}`).join(" · ")}`);
    lines.push(
      `  ${plural(g.issues, "open issue")}${change(g.issues, was["open issues"])}${g.prs === null ? "" : ` · ${plural(g.prs, "open PR")}`}`,
    );
    if (g.release) lines.push(`  Latest release ${g.release.tag}, ${plural(daysSince(g.release.at), "day")} ago`);
    lines.push("");
  }

  if (p.usedBy) {
    lines.push("Who uses it (public repos whose package.json names it)");
    lines.push(p.usedBy.length ? `  ${p.usedBy.join(" · ")}` : "  None found yet");
    lines.push("");
  }

  if (weekAgo) {
    const then = figures(weekAgo);
    const now = figures(p);
    const moved = Object.entries(now)
      .filter(([name, value]) => typeof value === "number" && typeof then[name] === "number" && value !== then[name])
      .map(([name, value]) => `${name} ${then[name]} → ${value}`);
    lines.push(`Since ${dateOf(weekAgo.at)}`);
    lines.push(moved.length ? `  ${moved.join("\n  ")}` : "  Nothing moved");
    lines.push("");
  }

  lines.push(last ? `Changes in brackets are since the last run, ${dateOf(last.at)}.` : "First run. Changes show from the next one.");
  if (failed.length) lines.push(`Couldn't read ${failed.join("; ")}.`);
  return lines.join("\n");
}

const pulse = await collect();
const history = readHistory();
mkdirSync(dirname(HISTORY), { recursive: true });
appendFileSync(HISTORY, `${JSON.stringify(pulse)}\n`);
console.log(process.argv.includes("--json") ? JSON.stringify(pulse, null, 2) : report(pulse, history));
