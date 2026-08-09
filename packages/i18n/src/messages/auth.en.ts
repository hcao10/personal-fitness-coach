import type { authZh } from "./auth.zh.ts";
import type { Widen } from "./widen.ts";

// Copy for app/auth (callback screens).
export const authEn = {
  returnToAppTitle: "Return to the Cmine Fit app",
  returnToAppHeading: "Go back to the Cmine Fit app",
  returnToAppBody: "Your sign-in result is handed to the app over a secure system link. If the app did not open on its own, check that the latest development build is installed, then sign in again.",
  openApp: "Open Cmine Fit",
  authCodeNotice: "This page never shows, stores or exchanges your sign-in authorization code.",
  serverCallbackNotice: "Cmine ID now completes sign-in securely on the server. Go back to the home page and sign in again.",
  backToHome: "Back to Cmine Fit",
  signInUnavailable: "Cmine ID sign-in is unavailable right now. Please try again shortly.",
  signInServiceUnreachable: "Could not reach the sign-in service. Please try again shortly.",
} as const satisfies Widen<typeof authZh>;
