// Expo config with environment-provided identifiers.
//
// The OAuth client id, API origin and RevenueCat public keys are supplied by
// the build environment (EAS secrets / .env), not committed here. They are not
// cryptographic secrets, but committing them ties the repository to one
// deployment and makes rotation a code change. With nothing configured the app
// surfaces "not configured" instead of silently pointing at production.
const config = require("./app.json");

module.exports = () => ({
  ...config.expo,
  extra: {
    ...config.expo.extra,
    apiOrigin: process.env.EXPO_PUBLIC_API_ORIGIN || config.expo.extra.apiOrigin,
    cmineIssuer: process.env.EXPO_PUBLIC_CMINE_ISSUER || config.expo.extra.cmineIssuer,
    cmineClientId: process.env.EXPO_PUBLIC_CMINE_CLIENT_ID || "",
    revenueCatAppleKey: process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY || "",
    revenueCatGoogleKey: process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY || "",
  },
});
