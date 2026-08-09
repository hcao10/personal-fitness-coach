import CoachApp from "./coach-app";
import { resolveLocale } from "./lib/locale-server";

export default async function Page() {
  // Resolved on the server and handed down, so the first render already uses
  // the right language — reading the cookie on the client instead would flash
  // Chinese and disagree with <html lang> during hydration.
  return <CoachApp initialLocale={await resolveLocale()} />;
}
