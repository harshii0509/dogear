/**
 * `@harshi04/dogear/server`: the backend half, for Node. A route handler that keeps the REST contract
 * (`createDogear`) and the stores it can sit on. The browser half never imports this.
 */
export { createDogear, type Assistant, type Created, type Directory, type DogearHandler, type DogearOptions } from "./handler";
export { memoryStore, fileStore, type Known, type Store } from "./store";
export { postgresStore, schema, type Query } from "./postgres";
export { webhook, excerpt, type Notifier } from "./notify";
