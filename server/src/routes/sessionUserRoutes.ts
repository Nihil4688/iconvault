// Returns the currently authenticated user for client-side session checks.
import { Router, type Request, type Response } from "express";
import { ForbiddenError } from "../lib/errors.js";
import { signSession } from "../lib/session.js";
import { requireDb } from "../middleware/requireDb.js";
import { requireUser } from "../middleware/requireUser.js";

const router = Router();

function publicUser(user: NonNullable<Request["user"]>, req: Request) {
  return {
    id: String(user._id),
    email: user.email,
    displayName: user.displayName,
    picture: user.picture ?? null,
    emailVerified: user.emailVerified,
    provider: user.provider,
    // Taken from the request so an API token, which never has admin rights, is shown as a plain user.
    role: req.isAdmin ? "admin" : "user",
    authMethod: req.authMethod ?? "session",
    lastLoginAt: user.lastLoginAt,
  };
}

router.get("/", requireUser, (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required." });
  }
  return res.json({ user: publicUser(req.user, req) });
});

// "Sign out everywhere": every session token issued before now stops working, on every device. The answer holds a fresh token so the device that asked stays signed in. API tokens are not touched (they are revoked one by one). The cut-off is rounded down to the second, the precision of a token's issue time.
router.post("/sign-out-everywhere", requireDb, requireUser, async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Authentication required." });
  if (req.authMethod === "token") throw new ForbiddenError("API tokens cannot sign sessions out.");
  user.tokensValidAfter = new Date(Math.floor(Date.now() / 1000) * 1000);
  await user.save();
  const token = await signSession({ sub: String(user._id), email: user.email, provider: user.provider, providerId: user.providerId });
  return res.json({ token });
});

export default router;
