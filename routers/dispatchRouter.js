const express = require("express");
const dispatchController = require("../controllers/dispatchController");
const { protect } = require("../utilities/auth");

const router = express.Router();

router.use(protect);

router.route("/:cityId/drivers").get(dispatchController.listDrivers);
router.route("/drivers/:membershipId").patch(dispatchController.reviewDriver);

module.exports = router;
