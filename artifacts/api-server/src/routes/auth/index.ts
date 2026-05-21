/**
 * Soft-lock auth endpoints.
 *
 *   POST /api/auth/unlock  { password }   → { token } if password matches
 *   GET  /api/auth/check   (Bearer token) → { ok: true } if token is valid
 *
 * Tokens are HMAC-signed in lib/auth.ts; no session storage required.
 */
import { Router, type IRouter } from "express";
import { checkPassword, issueToken, verifyToken, bearerFromHeader } from "../../lib/auth";

const router: IRouter = Router();

router.post("/auth/unlock", (req, res): void => {
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!checkPassword(password)) {
    // Generic message — no hint on whether the password was wrong vs. empty
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  res.json({ token: issueToken() });
});

router.get("/auth/check", (req, res): void => {
  const token = bearerFromHeader(req.get("authorization"));
  res.json({ ok: verifyToken(token) });
});

export default router;
