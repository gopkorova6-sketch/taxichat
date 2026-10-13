const express = require("express");
const membershipController = require("../controllers/membershipController");
const { protect } = require("../utilities/auth");
const { loadMemberships } = require("../utilities/rbac");

const router = express.Router();

router.use(protect, loadMemberships);

router.route("/me/home-city").patch(membershipController.setHomeCity);

module.exports = router;
