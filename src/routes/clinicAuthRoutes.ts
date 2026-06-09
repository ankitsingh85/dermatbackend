import { Router } from "express";
import {
  clinicMobileLogin,
  sendClinicLoginOtp,
  verifyClinicLoginOtp,
} from "../controllers/ClinicAuthController";

const router = Router();

router.post("/send-login-otp", sendClinicLoginOtp);
router.post("/verify-login-otp", verifyClinicLoginOtp);
router.post("/mobile-login", clinicMobileLogin);

export default router;
