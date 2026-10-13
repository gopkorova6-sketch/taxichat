const mongoose = require("mongoose");

// Role belongs to a city membership, not to the user (concept 1.3):
// one person can be a passenger in one city and a dispatcher in another.
const MEMBERSHIP_ROLES = ["passenger", "driver", "dispatcher", "region_admin"];
const MEMBERSHIP_STATUSES = ["WAITLIST", "PENDING", "ACTIVE", "REJECTED", "SUSPENDED"];

const membershipSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    cityId: { type: mongoose.Schema.Types.ObjectId, ref: "City", required: true },
    role: { type: String, enum: MEMBERSHIP_ROLES, required: true },
    status: { type: String, enum: MEMBERSHIP_STATUSES, required: true, default: "WAITLIST" },
    // Driver zones (1-5), resolved within the city
    zones: [{ type: mongoose.Schema.Types.ObjectId, ref: "Zone" }],
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reason: String,
  },
  { timestamps: true }
);

membershipSchema.index({ userId: 1, cityId: 1, role: 1 }, { unique: true });
membershipSchema.index({ cityId: 1, role: 1, status: 1 });

module.exports = mongoose.model("Membership", membershipSchema);
