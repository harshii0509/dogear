/** What an agent gets when someone copies threads: stable, complete, in order. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { toMarkdown } from "../src/markdown.ts";
import type { Comment } from "../src/model.ts";

const at = Date.UTC(2026, 9, 12, 9, 30);
const anchor = {
  selector: '[data-testid="trial"]', fx: 0, fy: 0, fw: 0, fh: 0, vx: 0, vy: 0, vw: 0, vh: 0,
  text: "Start free trial", label: 'button "Start free trial"',
};
const comment = (over: Partial<Comment>): Comment => ({
  id: "x", page: "/pricing?tab=a", parentId: null, body: "", author: { id: "a", name: "Alex Doe" },
  anchor: null, createdAt: at, editedAt: null, resolved: false, ...over,
});

test("threads in order, each with its element, status and replies", () => {
  const md = toMarkdown([
    comment({ id: "r2", body: "Tighten the spacing", anchor: { ...anchor, label: undefined, text: "" }, createdAt: at + 2, resolved: true }),
    comment({ id: "reply", parentId: "r1", body: "Agreed", author: { id: "r", name: "Ravi" }, createdAt: at + 1 }),
    comment({ id: "r1", body: "Make this the primary button\nand bigger", anchor }),
  ]);
  assert.equal(
    md,
    [
      "## Feedback on /pricing",
      "",
      '### 1. button "Start free trial"',
      "- Page: /pricing?tab=a",
      '- Selector: `[data-testid="trial"]`',
      '- Element text: "Start free trial"',
      "",
      "**Alex Doe** (2026-10-12 09:30 UTC): Make this the primary button\n    and bigger",
      "  - **Ravi** (2026-10-12 09:30 UTC): Agreed",
      "",
      '### 2. [data-testid="trial"] (resolved)',
      "- Page: /pricing?tab=a",
      '- Selector: `[data-testid="trial"]`',
      "",
      "**Alex Doe** (2026-10-12 09:30 UTC): Tighten the spacing",
      "",
    ].join("\n"),
  );
});

test("a title can be given, and an empty page says so", () => {
  assert.equal(toMarkdown([], "Checkout"), "## Feedback on Checkout\n\nNo comments.\n");
});
