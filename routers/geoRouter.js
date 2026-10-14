const express = require("express");
const geoController = require("../controllers/geoController");
const { protect } = require("../utilities/auth");

const router = express.Router();

// Reference city list is public (registration city picker); zones and
// landmarks require a session
router.get("/regions", geoController.getRegions);
router.get("/cities", geoController.getCities);

router.get("/cities/:id/zones", protect, geoController.getCityZones);
router.get("/cities/:id/landmarks", protect, geoController.getCityLandmarks);

module.exports = router;
