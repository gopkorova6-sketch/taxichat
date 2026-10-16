const express = require("express");
const reputationController = require("../controllers/reputationController");
const { protect } = require("../utilities/auth");
const { loadMemberships, requireRegionAdmin } = require("../utilities/rbac");

const router = express.Router();

router.use(protect);

router.route("/").post(reputationController.createComplaint);

// SOS lives on the order, complaints are listed by region admins
router.route("/:orderId/sos").post(reputationController.raiseSos);

const admin = express.Router();
// loadMemberships обязателен: requireRegionAdmin читает req.memberships
admin.use(protect, loadMemberships, requireRegionAdmin());
admin.route("/complaints").get(reputationController.listComplaints);
admin.route("/complaints/:id").patch(reputationController.reviewComplaint);

module.exports = { complaintRouter: router, adminComplaintRouter: admin };
