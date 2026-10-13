const mongoose = require("mongoose");

// One rating per direction per completed order (concept 1.9)
const ratingSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    fromRole: { type: String, enum: ["passenger", "driver"], required: true },
    toUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    stars: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, maxlength: 500 },
  },
  { timestamps: true }
);

ratingSchema.index({ orderId: 1, fromUserId: 1 }, { unique: true });

module.exports = mongoose.model("Rating", ratingSchema);
