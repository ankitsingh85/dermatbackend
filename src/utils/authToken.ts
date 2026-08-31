import jwt from "jsonwebtoken";

export const generateAuthToken = (id: string, role: string, extra?: string) => {
  return jwt.sign(
    { id, role, phone: extra, contactNo: extra },
    process.env.JWT_SECRET || "secret",
    { expiresIn: "30d" }
  );
};
