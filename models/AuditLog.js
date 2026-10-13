const mongoose = require("mongoose");

// Journal of every role assignment and review (concept 1.3)
const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    action: { type: String, required: true },
    targetType: String,
    targetId: mongoose.Schema.Types.ObjectId,
    payload: mongoose.Schema.Types.Mixed,
    at: { type: Date, default: Date.now, index: true },
  }
);

auditLogSchema.index({ targetType: 1, targetId: 1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
