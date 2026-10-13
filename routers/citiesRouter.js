const express = require("express");
const freeDriversController = require("../controllers/freeDriversController");
const { protect } = require("../utilities/auth");

const router = express.Router();

router.use(protect);

router.route("/:id/free-drivers").get(freeDriversController.listFreeDrivers);

module.exports = router;
