import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapWithConcurrency } from "../src/lib/concurrency.js";

describe("mapWithConcurrency", () => {
  it("runs work concurrently up to the limit and preserves result order", async () => {
    let active = 0;
    let maximumActive = 0;
    const result = await mapWithConcurrency([0, 1, 2, 3, 4], 2, async (value) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      return value * 2;
    });

    assert.equal(maximumActive, 2);
    assert.deepEqual(result, [0, 2, 4, 6, 8]);
  });
});
