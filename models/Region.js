const mongoose = require("mongoose");

// Subject of the Russian Federation (region)
const regionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    // OKTMO code of the subject, may be absent for manual entries
    oktmo: { type: String, index: true },
  },
  { timestamps: true }
);

regionSchema.index({ name: 1 });

module.exports = mongoose.model("Region", regionSchema);
