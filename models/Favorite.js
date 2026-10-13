const mongoose = require("mongoose");

// Passenger's personal list of favorite drivers (concept 1.9): they receive
// orders first in the cascade and can be called directly
const favoriteSchema = new mongoose.Schema(
  {
    passengerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    priority: { type: Number, default: 0 },
  },
  { timestamps: true }
);

favoriteSchema.index({ passengerId: 1, driverId: 1 }, { unique: true });

module.exports = mongoose.model("Favorite", favoriteSchema);
