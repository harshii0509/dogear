import { excerpt, headline, type Sender } from "@harshi04/dogear/server";

/**
 * Turns each new thread into a GitHub issue, labelled `dogear`, and closes it as completed when
 * the thread is resolved (and reopens it with the thread). `token` needs Issues: read and write
 * on `repo` ("owner/name").
 */
export function github({ token, repo, label = "dogear" }: { token: string; repo: string; label?: string }): Sender {
  async function call(path: string, method = "GET", body?: unknown) {
    const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "dogear",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`github answered ${response.status}`);
    return response.json();
  }
  /** Hidden in the issue's text, so a resolve can find it. */
  const marker = (id: string) => `<!-- dogear:${id} -->`;

  return {
    events: ["thread.created", "thread.resolved", "thread.reopened"],
    async send(event) {
      if (event.type === "thread.created") {
        await call("issues", "POST", {
          title: excerpt(event.comment, 80),
          body: `${headline(event)}\n\n> ${excerpt(event.comment)}\n\n[Open the thread](${event.link})\n\n${marker(event.comment.id)}`,
          labels: [label],
        });
        return;
      }
      // The newest 300 issues with the label: a thread resolved much later than that is left be.
      for (let page = 1; page <= 3; page++) {
        const issues: { number: number; body: string | null }[] = await call(
          `issues?labels=${encodeURIComponent(label)}&state=all&per_page=100&page=${page}`,
        );
        const issue = issues.find((i) => i.body?.includes(marker(event.comment.id)));
        if (issue) {
          const closed = event.type === "thread.resolved";
          await call(`issues/${issue.number}`, "PATCH", closed ? { state: "closed", state_reason: "completed" } : { state: "open" });
          return;
        }
        if (issues.length < 100) return;
      }
    },
  };
}
