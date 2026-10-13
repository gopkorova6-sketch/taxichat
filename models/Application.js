const mongoose = require("mongoose");

// Applications for dispatcher and region admin roles: submitted by the user,
// approved by the next role in the chain (concept 1.5).
const APPLICATION_TYPES = ["dispatcher", "region_admin"];
const APPLICATION_STATUSES = ["PENDING", "APPROVED", "REJECTED"];

const applicationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    cityId: { type: mongoose.Schema.Types.ObjectId, ref: "City", required: true },
    type: { type: String, enum: APPLICATION_TYPES, required: true },
    status: { type: String, enum: APPLICATION_STATUSES, required: true, default: "PENDING" },
    note: String,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reason: String,
  },
  { timestamps: true }
);

applicationSchema.index({ cityId: 1, type: 1, status: 1 });

module.exports = mongoose.model("Application", applicationSchema);
