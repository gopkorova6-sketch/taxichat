const mongoose = require("mongoose");

const CITY_STATUSES = ["DORMANT", "WAITLIST", "PILOT", "ACTIVE", "SUSPENDED"];
const MATCH_MODES = ["offers", "first_take", "dispatcher"];

const cascadeTimeoutsSchema = new mongoose.Schema(
  {
    // Seconds each cascade step stays exclusive, from the concept (section 1.6)
    favorites: { type: Number, default: 20 },
    zone: { type: Number, default: 60 },
    neighbors: { type: Number, default: 120 },
    city: { type: Number, default: 300 },
    expire: { type: Number, default: 300 },
  },
  { _id: false }
);

const directCallLimitsSchema = new mongoose.Schema(
  {
    maxConcurrent: { type: Number, default: 1 },
    maxPerHour: { type: Number, default: 10 },
    maxUnansweredPerDriver: { type: Number, default: 3 },
  },
  { _id: false }
);

const settingsSchema = new mongoose.Schema(
  {
    matchMode: { type: String, enum: MATCH_MODES, default: "offers" },
    cascadeTimeouts: { type: cascadeTimeoutsSchema, default: () => ({}) },
    waitingMinutes: { type: Number, default: 10 },
    preorderLeadMinutes: { type: Number, default: 30 },
    filterContacts: { type: Boolean, default: false },
    autoApproveDrivers: { type: Boolean, default: false },
    directCallsEnabled: { type: Boolean, default: true },
    directCallLimits: { type: directCallLimitsSchema, default: () => ({}) },
    directOrderTimeoutMin: { type: Number, default: 10 },
  },
  { _id: false }
);

// City / populated locality; geography is reference data without maps
const citySchema = new mongoose.Schema(
  {
    oktmo: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    regionId: { type: mongoose.Schema.Types.ObjectId, ref: "Region", index: true },
    // IANA timezone, e.g. Europe/Samara
    tz: { type: String, required: true, default: "Europe/Moscow" },
    status: { type: String, enum: CITY_STATUSES, default: "DORMANT", index: true },
    thresholds: {
      pilotDrivers: { type: Number, default: 3 },
      activeDrivers: { type: Number, default: 10 },
      activeDispatchers: { type: Number, default: 2 },
    },
    settings: { type: settingsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

citySchema.index({ name: 1 });

module.exports = mongoose.model("City", citySchema);
