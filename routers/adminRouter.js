const express = require("express");
const adminController = require("../controllers/adminController");
const { protect } = require("../utilities/auth");
const { loadMemberships, requireRegionAdmin } = require("../utilities/rbac");

const router = express.Router();

// loadMemberships обязателен: requireRegionAdmin читает req.memberships
router.use(protect, loadMemberships);

router.route("/applications").get(adminController.listApplications);
router.route("/applications/:id").patch(adminController.reviewApplication);
router.route("/roles").post(adminController.assignRole);
router.route("/audit").get(adminController.getAudit);
router.route("/users/:id/ban").patch(adminController.setUserBan);

module.exports = router;
