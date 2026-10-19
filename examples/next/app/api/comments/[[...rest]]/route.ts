import { createDogear, memoryStore } from "@harshi04/dogear/server";

/**
 * The REST contract (`docs/contract.md`), kept by `createDogear`. Storage is in memory and visitors
 * comment under a name they give, so the example runs with nothing to set up. In your app, swap
 * `memoryStore()` for `postgresStore(…)` and add `auth` for your session (docs/server.md).
 *
 * A coding agent (`dogear mcp --endpoint … ` with `DOGEAR_TOKEN`) signs in with DOGEAR_AGENT_TOKEN and
 * posts as "Agent". Unset, agents can't get in.
 */
const store = ((globalThis as { __dogearStore?: ReturnType<typeof memoryStore> }).__dogearStore ??= memoryStore());

const dogear = createDogear({
  store,
  guests: true,
  // A real site reads this from the environment (32+ random characters).
  secret: process.env.DOGEAR_SECRET ?? "dogear-example-secret-change-me-0123456789",
  agentToken: process.env.DOGEAR_AGENT_TOKEN,
});

export { dogear as GET, dogear as POST, dogear as PATCH, dogear as DELETE };
