const express = require("express");
const socialController = require("../controllers/socialController");
const { protect } = require("../utilities/auth");

const router = express.Router();

router.use(protect);

router.route("/favorites").get(socialController.listFavorites);
router.route("/favorites").post(socialController.addFavorite);
router.route("/favorites/:driverId").delete(socialController.removeFavorite);
router.route("/blocks").get(socialController.listBlocks);
router.route("/blocks").post(socialController.blockUser);
router.route("/blocks/:userId").delete(socialController.unblockUser);

module.exports = router;
