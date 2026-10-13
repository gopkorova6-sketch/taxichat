const express = require("express");
const driverController = require("../controllers/driverController");
const { protect } = require("../utilities/auth");

const router = express.Router();

router.use(protect);

router.route("/me").get(driverController.getMyDriverProfile);
router.route("/me/settings").patch(driverController.updateMySettings);

module.exports = router;
