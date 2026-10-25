// Single source for consent versioning on the client. The server's
// site_settings (disclaimer_version / privacy_version) is authoritative; these
// fallbacks only cover the moment before /api/v1/site responds. Bumping either
// version on the server forces every device to re-confirm the documents.
export const CONSENT_STORAGE_KEY = "cmine_fit_consent_accepted";
export const FALLBACK_DISCLAIMER_VERSION = "health-v3";
export const FALLBACK_PRIVACY_VERSION = "privacy-v2";
export const PRODUCT_VERSION = "web-2026.08";

export const consentStamp = (disclaimerVersion: string, privacyVersion: string) => `${disclaimerVersion}|${privacyVersion}`;
