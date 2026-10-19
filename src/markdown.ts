import { pathOf, type Comment } from "./model";

/**
 * Threads as Markdown, for pasting into Claude, Cursor or an issue: each thread's element (its
 * label, selector and text when it was commented on), its status, and every comment in order.
 * Pass all of a page's comments; replies are found by `parentId`. No DOM, so it runs anywhere.
 */
export function toMarkdown(comments: Comment[], title?: string): string {
  const roots = comments
    .filter((c) => c.parentId === null)
    .sort((a, b) => a.createdAt - b.createdAt);
  const heading = title ?? (roots[0] ? pathOf(roots[0].page) : "this page");
  const lines = [`## Feedback on ${heading}`];
  if (roots.length === 0) lines.push("", "No comments.");

  roots.forEach((root, index) => {
    const anchor = root.anchor;
    const what = anchor?.label || anchor?.selector || "the page";
    lines.push("", `### ${index + 1}. ${what}${root.resolved ? " (resolved)" : ""}`);
    if (anchor) {
      lines.push(`- Page: ${root.page}`);
      lines.push(`- Selector: \`${anchor.selector}\``);
      if (anchor.text) lines.push(`- Element text: "${anchor.text}"`);
    }
    lines.push("", entry(root));
    const replies = comments
      .filter((c) => c.parentId === root.id)
      .sort((a, b) => a.createdAt - b.createdAt);
    for (const reply of replies) lines.push(`  - ${entry(reply)}`);
  });
  return lines.join("\n") + "\n";
}

/** `**Asha Rao** (2026-10-12 09:30 UTC): the body`, the body's line breaks kept inside the item. */
function entry(comment: Comment) {
  const when = new Date(comment.createdAt).toISOString().slice(0, 16).replace("T", " ");
  const body = comment.body.replace(/\n/g, "\n    ");
  return `**${comment.author.name}** (${when} UTC): ${body}`;
}
