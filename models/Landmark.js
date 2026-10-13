const mongoose = require("mongoose");

// Landmark: train station, airport, mall, etc. Passengers may type an alias
// ("от ЖД") and the server resolves the landmark via the text index.
const landmarkSchema = new mongoose.Schema(
  {
    cityId: { type: mongoose.Schema.Types.ObjectId, ref: "City", required: true, index: true },
    zoneId: { type: mongoose.Schema.Types.ObjectId, ref: "Zone" },
    name: { type: String, required: true },
    aliases: [String],
  },
  { timestamps: true }
);

landmarkSchema.index({ cityId: 1, name: 1 }, { unique: true });
landmarkSchema.index({ name: "text", aliases: "text" });

module.exports = mongoose.model("Landmark", landmarkSchema);
