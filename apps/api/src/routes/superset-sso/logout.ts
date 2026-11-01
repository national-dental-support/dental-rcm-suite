import { Router, Request, Response } from "express";

const router = Router();

/**
 * Clears Superset auth so users are fully logged out.
 * This MUST clear both:
 *  - superset_sso (your SSO cookie)
 *  - session      (Superset's own login session)
 */
router.post("/logout", (req: Request, res: Response) => {
  const isProd = process.env.NODE_ENV === "production";

  console.warn("[SSO LOGOUT] Logout route hit");

  // Clear your SSO cookie
  res.clearCookie("superset_sso", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/superset",
  });

  console.warn("[SSO LOGOUT] superset_sso cookie cleared");

  // Clear Superset's internal session cookie
  res.clearCookie("session", {
    secure: isProd,
    path: "/superset",
  });

  console.warn("[SSO LOGOUT] Superset session cookie cleared");

  return res.status(200).json({ ok: true });
});

export default router;
