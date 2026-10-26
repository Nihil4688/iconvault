// Signs and verifies the short-lived HS256 JWT used to authenticate protected requests.
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const ISSUER = "svg-compiler-server";
const AUDIENCE = "svg-compiler-client";
const TTL_SECONDS = 60 * 60 * 24 * 7;

// Returns the session secret as a Uint8Array, throwing an error if it's not configured or too short.
function getSecret(): Uint8Array {
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < 16) {
    throw new Error(
      "SESSION_SECRET is not configured. Set it in server/.env (at least 16 chars)."
    );
  }
  return new TextEncoder().encode(raw);
}

// Providers a session may belong to. Mirrors the `provider` enum on the User model so every stored user can hold a valid session.
const SESSION_PROVIDERS = ["google", "microsoft", "password", "system"] as const;
export type SessionProvider = (typeof SESSION_PROVIDERS)[number];

// Type definition for the claims returned in a session token.
export type SessionClaims = {
  sub: string;
  email: string;
  provider: SessionProvider;
  providerId: string;
};

// Type guard to check if the payload has the required session claims.
function isSessionClaims(payload: JWTPayload): payload is SessionClaims & JWTPayload {
  const provider = (payload as { provider?: unknown }).provider;
  return (
    typeof payload.sub === "string" &&
    typeof (payload as { email?: unknown }).email === "string" &&
    typeof provider === "string" &&
    (SESSION_PROVIDERS as readonly string[]).includes(provider) &&
    typeof (payload as { providerId?: unknown }).providerId === "string"
  );
}

// Signs a new session token with the given claims and returns it as a string.
export async function signSession(claims: SessionClaims): Promise<string> {
  return await new SignJWT({
    email: claims.email,
    provider: claims.provider,
    providerId: claims.providerId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(getSecret());
}

// Verifies the session token and returns the claims and the time it was issued (seconds since 1970).
export async function verifySessionToken(token: string): Promise<{ claims: SessionClaims; issuedAt: number }> {
  const { payload } = await jwtVerify(token, getSecret(), {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  if (!isSessionClaims(payload) || typeof payload.iat !== "number") {
    throw new Error("Session token is malformed.");
  }
  return {
    claims: {
      sub: payload.sub,
      email: payload.email,
      provider: payload.provider,
      providerId: payload.providerId,
    },
    issuedAt: payload.iat,
  };
}

// Verifies the session token and returns the claims if valid.
export async function verifySession(token: string): Promise<SessionClaims> {
  return (await verifySessionToken(token)).claims;
}
