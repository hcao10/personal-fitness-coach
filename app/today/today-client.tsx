"use client";

// The session lives in app/features/workout, next to the session player, the
// feedback panel and the repositories they share. This file stays so every
// existing link to /today keeps working.
export { default } from "../features/workout/today-client";
