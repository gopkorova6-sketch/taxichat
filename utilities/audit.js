const AuditLog = require("../models/AuditLog");

// Writes a journal entry for every role assignment, review or moderation action
const logAudit = async ({ actorId, action, targetType, targetId, payload }) =>
  AuditLog.create({
    actorId,
    action,
    ...(targetType && { targetType }),
    ...(targetId && { targetId }),
    ...(payload !== undefined && { payload }),
    at: new Date(),
  });

module.exports = { logAudit };
