const express = require("express");
const chatController = require("../controllers/chatController");
const { protect } = require("../utilities/auth");

const router = express.Router();

router.use(protect);

router.route("/my").get(chatController.listMyChats);
router.route("/:id/read").post(chatController.markChatRead);
router.route("/:id/messages").get(chatController.listChatMessages);
router.route("/:id/messages").post(chatController.sendChatMessage);
router.route("/:id/offers").post(chatController.sendChatOffer);

module.exports = router;
