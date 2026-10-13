const mongoose = require("mongoose");

// Personal black list "passenger <-> driver" (concept 1.9)
const blockSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    blockedUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

blockSchema.index({ userId: 1, blockedUserId: 1 }, { unique: true });

module.exports = mongoose.model("Block", blockSchema);
