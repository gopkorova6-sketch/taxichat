const mongoose = require("mongoose");

const CALL_RESULTS = ["answered", "missed", "declined", "cancelled"];

// Call metadata only; voice is never recorded or stored (concept 1.7.1)
const callLogSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", index: true },
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", index: true },
    kind: { type: String, enum: ["order", "direct"], default: "order" },
    callerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    calleeId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    startedAt: { type: Date, default: Date.now },
    answeredAt: Date,
    endedAt: Date,
    durationSec: Number,
    result: { type: String, enum: CALL_RESULTS },
  },
  { timestamps: true }
);

callLogSchema.index({ callerId: 1, startedAt: -1 });

module.exports = mongoose.model("CallLog", callLogSchema);
