const mongoose = require("mongoose");

const COMPLAINT_TYPES = ["sos", "fraud", "behavior", "safety", "other"];
const COMPLAINT_STATUSES = ["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"];

// Complaints and SOS signals go to the region admin (concept 1.9)
const complaintSchema = new mongoose.Schema(
  {
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", index: true },
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    type: { type: String, enum: COMPLAINT_TYPES, required: true },
    status: { type: String, enum: COMPLAINT_STATUSES, default: "OPEN", index: true },
    text: { type: String, required: true, maxlength: 1000 },
    resolution: String,
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

complaintSchema.index({ type: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("Complaint", complaintSchema);
