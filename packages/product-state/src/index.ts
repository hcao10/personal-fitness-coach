// Testable finite state machines for the core loop. No React, no fetch, no
// database — every module here can be loaded by `node --test` directly, which
// is what makes "every state has a way out" an assertion rather than a claim.
//
// Explicit .ts extensions so Node's type stripping can resolve them; the bundler
// resolves them the same way (see packages/i18n/src/index.ts).
export * from "./capability.ts";
export * from "./profile.ts";
export * from "./plan.ts";
export * from "./workout.ts";
export * from "./coach.ts";
export * from "./events.ts";
export * from "./coach-rules.ts";
