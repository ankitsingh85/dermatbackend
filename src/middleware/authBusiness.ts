import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Shared auth for the three "business" roles (clinic, doctor, b2buser) —
// all three sign in through businesslogin.tsx and get a token from the
// same generateAuthToken() helper, so one middleware can verify any of them.
export interface BusinessAuthRequest extends Request {
  business?: { id: string; role: "clinic" | "doctor" | "b2buser" };
}

const BUSINESS_ROLES = ["clinic", "doctor", "b2buser"];

export const businessAuth = (req: BusinessAuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token, authorization denied" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret") as {
      id: string;
      role: string;
    };

    const role = String(decoded.role || "").toLowerCase();
    if (!BUSINESS_ROLES.includes(role)) {
      return res.status(403).json({ message: "Business account access denied" });
    }

    req.business = { id: decoded.id, role: role as "clinic" | "doctor" | "b2buser" };
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token is not valid" });
  }
};

// Optional business auth — attaches req.business if a valid business token
// is present, but never rejects, so the admin panel (which has no login of
// its own in this app) can hit the same endpoints unauthenticated.
export const optionalBusinessAuth = (
  req: BusinessAuthRequest,
  _res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return next();

  try {
    const decoded = jwt.verify(
      authHeader.split(" ")[1],
      process.env.JWT_SECRET || "secret"
    ) as { id: string; role: string };
    const role = String(decoded.role || "").toLowerCase();
    if (BUSINESS_ROLES.includes(role)) {
      req.business = { id: decoded.id, role: role as "clinic" | "doctor" | "b2buser" };
    }
  } catch {
    // Ignore invalid/expired tokens here — treated as admin/anonymous access.
  }
  next();
};
