const mongoose = require("mongoose");
const Order = require("../models/Order");
const CallLog = require("../models/CallLog");
const ApiError = require("../utilities/errors");
const catchAsyncError = require("../utilities/catchAsyncError");
const callService = require("../services/callService");

// GET /api/calls/ice?orderId= — temporary TURN credentials bound to the user
// and the order (concept 1.7.1)
exports.getIceCredentials = catchAsyncError(async (req, res) => {
  const { orderId } = req.query;

  if (orderId) {
    if (!mongoose.isValidObjectId(orderId))
      throw new ApiError(400, "Некорректный идентификатор заказа");

    const order = await Order.findById(orderId);
    if (!order) throw new ApiError(404, "Заказ не найден");

    if (!(await callService.isOrderCallParticipant(order, req.user._id)))
      throw new ApiError(403, "Вы не участник этого заказа");
  }

  res.json({
    status: "success",
    data: {
      iceServers: callService.buildIceServers(req.user._id),
      iceTransportPolicy: process.env.TURN_URL ? "relay" : "all",
    },
  });
});

// GET /api/orders/:id/calls — call history of the order
exports.listOrderCalls = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id))
    throw new ApiError(400, "Некорректный идентификатор заказа");

  const order = await Order.findById(id);
  if (!order) throw new ApiError(404, "Заказ не найден");

  if (!(await callService.isOrderCallParticipant(order, req.user._id)))
    throw new ApiError(403, "Вы не участник этого заказа");

  const calls = await CallLog.find({ orderId: id })
    .sort({ startedAt: -1 })
    .limit(100);

  res.json({ status: "success", data: { calls } });
});
