const express = require("express");
const geoController = require("../controllers/geoController");

const router = express.Router();

router.get("/regions", geoController.getRegions);
router.get("/cities", geoController.getCities);
router.get("/cities/:id/zones", geoController.getCityZones);
router.get("/cities/:id/landmarks", geoController.getCityLandmarks);

module.exports = router;
