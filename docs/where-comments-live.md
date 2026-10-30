# Where comments live

Comments live wherever your adapter puts them: your database, a file on your server, or the
visitor's own browser. Dogear runs no service of its own. The widget talks only to the adapter
you give it, and nothing about a comment is sent anywhere else.

| Your setup | Where comments are | Who can see them | How to get them out |
|---|---|---|---|
| Nothing yet, `localAdapter()` | This browser's localStorage, under the key `dogear` | Only the person in that browser | Copy as Markdown in the list, or `Dogear.markdown()` |
| `npx dogear serve` | `.dogear/comments.json` in the folder you ran it from | People on your machine | The file itself, `dogear mcp`, or `--webhook` |
| `createDogear` with `memoryStore()` | Your server's memory, gone when it restarts | Whoever the route lets in | Connectors, `dogear mcp` |
| `createDogear` with `fileStore(path)` | A JSON file on your server | Whoever the route lets in | The file, connectors, `dogear mcp` |
| `createDogear` with `postgresStore` | The `dogear_comments` table in your Postgres | Whoever the route lets in | SQL, connectors, `dogear mcp` |
| [Supabase](examples/supabase.md) | The `comments` table in your Supabase project | Whoever your Row Level Security allows | SQL, the [database trigger](connectors/supabase-trigger.md), `dogear mcp --adapter` |
| Your own adapter or route | Wherever your code writes them | Whoever your code allows | Your code, `dogear mcp --adapter` |

## Who can see them

- **The route decides,** never the browser. With `createDogear`, the people your `auth` returns
  and the guests it signs in can read and write. `canSee` makes comments as private as their
  pages ([server.md](server.md)).
- **Emails stay on the server.** They're used to send alerts and never appear on a comment.
- **Guests have no account.** A guest's name and avatar live in a signed cookie, and their
  comments carry that name.

## Sending them elsewhere

- **Connectors** send new threads, replies, resolves and reopens to Slack, Teams, Notion, Linear,
  GitHub or any URL, as they happen ([connectors](connectors/README.md)).
- **Coding agents** read and answer threads through `dogear mcp` ([mcp.md](mcp.md)).
- **By hand,** any thread copies as Markdown from the list, or all of them with Copy all.
- **Your database** is yours: the table is plain rows you can query, export or back up.
