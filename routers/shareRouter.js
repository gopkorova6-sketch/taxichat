const express = require("express");
const shareController = require("../controllers/shareController");

// Public read-only share links live outside the auth protector;
// the router is mounted at the app root
const router = express.Router();

router.route("/api/share/:token").get(shareController.viewSharedTrip);

module.exports = router;
