import { Router } from "express";
import { getProfile } from "../controllers/profile.controller";
import { protect } from "../middlewares/auth.middleware";

const router = Router();

// All profile routes are protected
router.use(protect);

router.get("/me", getProfile);

export default router;
