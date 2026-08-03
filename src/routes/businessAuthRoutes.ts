import { Router } from "express";
import {
  businessMobileLogin,
  sendBusinessLoginOtp,
  verifyBusinessLoginOtp,
} from "../controllers/BusinessAuthController";

const router = Router();

router.post("/send-login-otp", sendBusinessLoginOtp);
router.post("/verify-login-otp", verifyBusinessLoginOtp);
router.post("/mobile-login", businessMobileLogin);

export default router;
