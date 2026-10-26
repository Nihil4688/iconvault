// Personal API tokens: how they are made and recognised. A token looks like `isv_` followed by 43 random URL-safe characters (256 bits). Only its SHA-256 hash is stored.
import { createHash, randomBytes } from "node:crypto";

export const TOKEN_PREFIX = "isv_";
// The characters of a token kept in clear text to tell tokens apart in a list (the prefix plus a few random characters).
export const TOKEN_DISPLAY_LENGTH = 8;
export const MAX_ACTIVE_TOKENS_PER_USER = 10;

export function generateToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function looksLikeApiToken(value: string): boolean {
  return value.startsWith(TOKEN_PREFIX);
}
