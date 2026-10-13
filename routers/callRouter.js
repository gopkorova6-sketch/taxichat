const express = require("express");
const callController = require("../controllers/callController");
const { protect } = require("../utilities/auth");
const { loadMemberships } = require("../utilities/rbac");

const router = express.Router();

router.use(protect);

router.route("/ice").get(callController.getIceCredentials);

module.exports = router;
