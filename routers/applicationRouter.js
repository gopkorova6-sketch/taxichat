const express = require("express");
const applicationController = require("../controllers/applicationController");
const { protect } = require("../utilities/auth");

const router = express.Router();

router.use(protect);

router.route("/").post(applicationController.createApplication);
router.route("/mine").get(applicationController.getMyApplications);

module.exports = router;
