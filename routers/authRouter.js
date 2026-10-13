const express = require("express");
const authController = require("../controllers/authController");
const { validateBody } = require("../utilities/catchAsyncError");
const { protect } = require("../utilities/auth");

const router = express.Router();

router.post("/register", validateBody(authController.registerSchema), authController.register);
router.post("/login", validateBody(authController.loginSchema), authController.login);
router.post("/logout", authController.logout);
router.get("/me", protect, authController.me);

module.exports = router;
