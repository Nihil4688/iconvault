// Unit tests for the shared error mapping used by the Express error handler.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  errorHandler,
  toHttpError,
} from "../src/lib/errors.js";

describe("toHttpError", () => {
  it("turns a zod failure into 400 with the first problem and all details", () => {
    const parsed = z.object({ name: z.string().min(1), color: z.string().regex(/^#/) }).safeParse({ name: "", color: "x" });
    assert.equal(parsed.success, false);
    const { status, body } = toHttpError((parsed as { error: unknown }).error);
    assert.equal(status, 400);
    assert.match(body.error, /^Invalid input \(name\)/);
    assert.equal((body.details as unknown[]).length, 2);
  });

  it("keeps the status and message of app errors", () => {
    assert.deepEqual(toHttpError(new UnauthorizedError()), { status: 401, body: { error: "Authentication required." } });
    assert.equal(toHttpError(new ForbiddenError()).status, 403);
    assert.equal(toHttpError(new NotFoundError("Project not found.")).body.error, "Project not found.");
    assert.equal(toHttpError(new ConflictError()).status, 409);
    assert.equal(toHttpError(new AppError(422, "Nope", { field: "x" })).body.details instanceof Object, true);
  });

  it("maps database errors", () => {
    assert.equal(toHttpError({ name: "CastError" }).status, 400);
    assert.equal(toHttpError({ name: "ValidationError" }).status, 400);
    assert.equal(toHttpError({ code: 11000 }).status, 409);
  });

  it("maps body-parser errors", () => {
    assert.equal(toHttpError({ type: "entity.parse.failed" }).status, 400);
    assert.equal(toHttpError({ type: "entity.too.large" }).status, 413);
  });

  it("never leaks the message of an unknown error", () => {
    const { status, body } = toHttpError(new Error("secret connection string"));
    assert.equal(status, 500);
    assert.equal(body.error, "Internal server error.");
    assert.equal(toHttpError("a string").status, 500);
    assert.equal(toHttpError(null).status, 500);
  });
});

describe("errorHandler", () => {
  function fakeRes(headersSent = false) {
    const out: { status?: number; body?: unknown } = {};
    const res = {
      headersSent,
      status(code: number) {
        out.status = code;
        return res;
      },
      json(body: unknown) {
        out.body = body;
        return res;
      },
    };
    return { res, out };
  }

  it("writes the mapped status and body", () => {
    const { res, out } = fakeRes();
    errorHandler(new NotFoundError("Gone."), {} as never, res as never, () => assert.fail("next must not run"));
    assert.equal(out.status, 404);
    assert.deepEqual(out.body, { error: "Gone." });
  });

  it("hands over to Express when the response has already started", () => {
    const { res, out } = fakeRes(true);
    let forwarded: unknown;
    const boom = new Error("late");
    errorHandler(boom, {} as never, res as never, (e?: unknown) => {
      forwarded = e;
    });
    assert.equal(forwarded, boom);
    assert.equal(out.status, undefined);
  });
});
