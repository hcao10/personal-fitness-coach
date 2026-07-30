import { safeEqual } from "./security";

type JsonWebKeyWithKid = JsonWebKey & { kid?: string; alg?: string };
type Jwks = { keys: JsonWebKeyWithKid[] };
export type CmineAccessClaims = {
  iss: string;
  aud: string | string[];
  sub: string;
  exp: number;
  iat?: number;
  nbf?: number;
};

const encoder = new TextEncoder();
let cachedJwks: { issuer: string; expiresAt: number; value: Jwks } | null = null;

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJson<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}

function arrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.slice().buffer as ArrayBuffer;
}

async function getJwks(issuer: string, force = false): Promise<Jwks> {
  const now = Date.now();
  if (!force && cachedJwks?.issuer === issuer && cachedJwks.expiresAt > now) return cachedJwks.value;
  const response = await fetch(`${issuer}/.well-known/jwks.json`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`CMINE_JWKS_FAILED:${response.status}`);
  const value = await response.json() as Jwks;
  if (!Array.isArray(value.keys) || value.keys.length === 0) throw new Error("CMINE_JWKS_INVALID");
  cachedJwks = { issuer, expiresAt: now + 5 * 60_000, value };
  return value;
}

function algorithmFor(alg: string, jwk: JsonWebKeyWithKid): AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams {
  if (alg === "RS256" && jwk.kty === "RSA") return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
  if (alg === "ES256" && jwk.kty === "EC" && jwk.crv === "P-256") return { name: "ECDSA", namedCurve: "P-256" };
  if (alg === "EdDSA" && jwk.kty === "OKP" && jwk.crv === "Ed25519") return { name: "Ed25519" };
  throw new Error("CMINE_JWT_ALG_UNSUPPORTED");
}

function verifyAlgorithm(alg: string): AlgorithmIdentifier | EcdsaParams {
  if (alg === "RS256") return { name: "RSASSA-PKCS1-v1_5" };
  if (alg === "ES256") return { name: "ECDSA", hash: "SHA-256" };
  if (alg === "EdDSA") return { name: "Ed25519" };
  throw new Error("CMINE_JWT_ALG_UNSUPPORTED");
}

async function verifyWithJwk(token: string, jwk: JsonWebKeyWithKid, alg: string): Promise<boolean> {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
  const key = await crypto.subtle.importKey("jwk", jwk, algorithmFor(alg, jwk), false, ["verify"]);
  return crypto.subtle.verify(
    verifyAlgorithm(alg),
    key,
    arrayBuffer(decodeBase64Url(encodedSignature)),
    arrayBuffer(encoder.encode(`${encodedHeader}.${encodedPayload}`)),
  );
}

export async function verifyCmineAccessToken(
  token: string,
  issuerValue: string,
  clientId: string,
): Promise<CmineAccessClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("CMINE_JWT_FORMAT");
  const header = decodeJson<{ alg?: string; kid?: string; typ?: string }>(parts[0]);
  const claims = decodeJson<Partial<CmineAccessClaims>>(parts[1]);
  if (!header.alg || !header.kid || header.alg === "none") throw new Error("CMINE_JWT_HEADER");

  const issuer = issuerValue.replace(/\/$/, "");
  let jwks = await getJwks(issuer);
  let jwk = jwks.keys.find((candidate) => candidate.kid === header.kid);
  if (!jwk) {
    jwks = await getJwks(issuer, true);
    jwk = jwks.keys.find((candidate) => candidate.kid === header.kid);
  }
  if (!jwk || (jwk.alg && jwk.alg !== header.alg)) throw new Error("CMINE_JWT_KEY");
  if (!await verifyWithJwk(token, jwk, header.alg)) throw new Error("CMINE_JWT_SIGNATURE");

  const now = Math.floor(Date.now() / 1000);
  const audiences = typeof claims.aud === "string" ? [claims.aud] : claims.aud;
  if (!claims.iss || !safeEqual(claims.iss.replace(/\/$/, ""), issuer)) throw new Error("CMINE_JWT_ISSUER");
  if (!Array.isArray(audiences) || !audiences.some((audience) => safeEqual(audience, clientId))) throw new Error("CMINE_JWT_AUDIENCE");
  if (!claims.sub || typeof claims.sub !== "string") throw new Error("CMINE_JWT_SUBJECT");
  if (!claims.exp || claims.exp < now - 30) throw new Error("CMINE_JWT_EXPIRED");
  if (claims.nbf && claims.nbf > now + 30) throw new Error("CMINE_JWT_NOT_ACTIVE");
  return claims as CmineAccessClaims;
}
