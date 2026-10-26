import assert from "node:assert/strict";
import { test } from "node:test";
import { productionConfigProblems } from "../src/config/production.js";

const good = { NODE_ENV: "production", SESSION_SECRET: "x".repeat(32), CORS_ORIGINS: "https://app.example.com" } as NodeJS.ProcessEnv;

test("development is never checked", () => {
  assert.deepEqual(productionConfigProblems({ NODE_ENV: "development" } as NodeJS.ProcessEnv), []);
  assert.deepEqual(productionConfigProblems({} as NodeJS.ProcessEnv), []);
});

test("a complete production setup passes", () => {
  assert.deepEqual(productionConfigProblems(good), []);
});

test("production needs a long secret", () => {
  const problems = productionConfigProblems({ ...good, SESSION_SECRET: "short-secret-123456" });
  assert.equal(problems.length, 1);
  assert.match(problems[0] as string, /SESSION_SECRET/);
});

test("production needs CORS_ORIGINS", () => {
  for (const value of [undefined, "", " , "]) {
    const problems = productionConfigProblems({ ...good, CORS_ORIGINS: value });
    assert.equal(problems.length, 1);
    assert.match(problems[0] as string, /CORS_ORIGINS/);
  }
});
