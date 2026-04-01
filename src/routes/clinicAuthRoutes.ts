import { Router } from "express";
import { clinicMobileLogin } from "../controllers/ClinicAuthController";

const router = Router();

router.post("/mobile-login", clinicMobileLogin);

export default router;
