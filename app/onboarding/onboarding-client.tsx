"use client";

// The intake now lives in app/features/profile, next to the draft store and the
// repositories it uses. This file stays so that every existing link to
// /onboarding keeps working.
export { default } from "../features/profile/intake-client";
