// routes/authRoutes.ts
import { Router } from "express";
import {
  adminSignup,
  adminLogin,
  userMobileLogin,
  sendUserLoginOtp,
  verifyUserLoginOtp,
} from "../controllers/AuthController";

const router = Router();

// ------------------ ADMIN ROUTES ------------------
router.post("/admin/signup", adminSignup);
router.post("/admin/login", adminLogin);

// ------------------ USER ROUTES ------------------
router.post("/user/send-login-otp", sendUserLoginOtp);
router.post("/user/verify-login-otp", verifyUserLoginOtp);
router.post("/user/mobile-login", userMobileLogin);

export default router; // ✅ important for Express
