const express = require("express");
const orderController = require("../controllers/orderController");
const { protect } = require("../utilities/auth");
const { loadMemberships } = require("../utilities/rbac");

const router = express.Router();

router.use(protect, loadMemberships);

router.route("/").post(orderController.createOrder);
router.route("/").get(orderController.listOrders);
router.route("/:id").get(orderController.getOrder);
router.route("/:id/action").post(orderController.orderAction);
router.route("/:id/cancel").post(orderController.cancelOrder);
router.route("/:id/dispute").post(orderController.openDispute);
router.route("/:id/offers").get(orderController.listOffers);
router.route("/:id/offers").post(orderController.createOffer);
router.route("/:id/accept").post(orderController.acceptOrder);
router.route("/:id/assign").post(orderController.assignByDispatcher);
router.route("/:id/messages").get(orderController.listMessages);
router.route("/:id/messages").post(orderController.sendOrderMessage);

module.exports = router;
