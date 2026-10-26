// Unit tests for how API tokens are made and recognised.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TOKEN_PREFIX, generateToken, hashToken, looksLikeApiToken } from "../src/lib/apiToken.js";

describe("api tokens", () => {
  it("are long, random and recognisable", () => {
    const a = generateToken();
    const b = generateToken();
    assert.notEqual(a, b);
    assert.match(a, /^isv_[A-Za-z0-9_-]{43}$/);
    assert.equal(looksLikeApiToken(a), true);
    assert.equal(looksLikeApiToken("eyJhbGciOi.session.jwt"), false);
    assert.equal(a.startsWith(TOKEN_PREFIX), true);
  });

  it("are stored as a stable hash that does not contain the token", () => {
    const token = generateToken();
    assert.equal(hashToken(token), hashToken(token));
    assert.notEqual(hashToken(token), hashToken(`${token}x`));
    assert.match(hashToken(token), /^[0-9a-f]{64}$/);
    assert.equal(hashToken(token).includes(token.slice(4, 20)), false);
  });
});
