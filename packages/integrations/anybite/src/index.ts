// Contract-only integration seam for anyBite. See docs/adr/0002.
// Nothing here reaches the network: the peer service does not exist yet, and a
// stub that pretends otherwise is worse than no integration at all.
export * from "./contracts.ts";
export * from "./disabled-adapter.ts";
