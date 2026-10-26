// API token routes: list, create and revoke the signed-in user's own tokens. These need a real sign-in session, not a token, so a leaked token can never mint more tokens. Mounted at /api/tokens.
import { Router } from "express";
import { z } from "zod";
import { ForbiddenError } from "../lib/errors.js";
import { actorOf, parseObjectId } from "../lib/http.js";
import { requireDb } from "../middleware/requireDb.js";
import { requireUser } from "../middleware/requireUser.js";
import { createToken, listTokens, revokeToken } from "../services/tokenService.js";

const router = Router();
router.use(requireDb, requireUser, (req, _res, next) => {
  if (req.authMethod === "token") throw new ForbiddenError("API tokens can only be managed from a signed-in browser session.");
  next();
});

// A new token is read-only and lasts 90 days unless the caller asks otherwise; expiresInDays: null means it never expires.
const createSchema = z
  .object({
    name: z.string().trim().min(1, "is required").max(60),
    scope: z.enum(["read", "write"]).default("read"),
    expiresInDays: z.number().int().min(1).max(365).nullable().default(90),
  })
  .strict();
const me = (req: Parameters<typeof actorOf>[0]) => parseObjectId(actorOf(req).id);

router.get("/", async (req, res) => {
  res.json(await listTokens(me(req)));
});

router.post("/", async (req, res) => {
  const { name, scope, expiresInDays } = createSchema.parse(req.body ?? {});
  res.status(201).json(await createToken(me(req), name, { scope, expiresInDays }));
});

router.delete("/:tokenId", async (req, res) => {
  res.json(await revokeToken(me(req), parseObjectId(req.params.tokenId, "token id")));
});

export default router;
