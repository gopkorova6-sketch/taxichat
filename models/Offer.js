const mongoose = require("mongoose");

// Driver response to an order: a text price and ETA in minutes (concept 1.6)
const offerSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    priceText: { type: String, required: true, maxlength: 50 },
    etaMin: { type: Number, required: true, min: 1, max: 180 },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "DECLINED"],
      default: "PENDING",
    },
  },
  { timestamps: true }
);

offerSchema.index({ orderId: 1, driverId: 1 }, { unique: true });

module.exports = mongoose.model("Offer", offerSchema);
