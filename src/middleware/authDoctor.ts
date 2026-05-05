import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface DoctorAuthRequest extends Request {
  doctor?: { id: string; role: string; phone?: string };
}

export const doctorAuth = (
  req: DoctorAuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token, authorization denied" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret") as {
      id: string;
      role: string;
      phone?: string;
    };

    if (decoded.role !== "doctor") {
      return res.status(403).json({ message: "Doctor access denied" });
    }

    req.doctor = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Token is not valid" });
  }
};
