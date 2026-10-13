const mongoose = require("mongoose");

// Zone of a city: named area with a list of streets, no polygons.
// Neighbors form the zone adjacency graph used instead of a map radius.
const zoneSchema = new mongoose.Schema(
  {
    cityId: { type: mongoose.Schema.Types.ObjectId, ref: "City", required: true, index: true },
    name: { type: String, required: true },
    streets: [String],
    neighbors: [{ type: mongoose.Schema.Types.ObjectId, ref: "Zone" }],
  },
  { timestamps: true }
);

zoneSchema.index({ cityId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Zone", zoneSchema);
