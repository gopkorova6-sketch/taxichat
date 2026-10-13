const express = require("express");
const adminController = require("../controllers/adminController");
const { protect } = require("../utilities/auth");

const router = express.Router();

router.use(protect);

router.route("/applications").get(adminController.listApplications);
router.route("/applications/:id").patch(adminController.reviewApplication);
router.route("/roles").post(adminController.assignRole);
router.route("/audit").get(adminController.getAudit);

module.exports = router;
