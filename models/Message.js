const mongoose = require("mongoose");

const MESSAGE_KINDS = [
  "text",
  "voice",
  "photo",
  "system",
  "action",
  "offer",
  "order_card",
];

// Flat message model for order/direct/zone/city chats (concept 1.7).
// Messages of finished orders get expireAt and are removed by the TTL index.
const messageSchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
      index: true,
    },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // "user" for humans, "bot" for the dispatcher bot system messages
    senderType: { type: String, enum: ["user", "bot"], default: "user" },
    kind: { type: String, enum: MESSAGE_KINDS, default: "text" },
    body: { type: String, maxlength: 4000 },
    meta: mongoose.Schema.Types.Mixed,
    readBy: [mongoose.Schema.Types.ObjectId],
    createdAt: { type: Date, default: Date.now, index: true },
    expireAt: { type: Date, default: null, index: { expires: 0 } },
  },
  { timestamps: true }
);

messageSchema.index({ chatId: 1, createdAt: -1 });

module.exports = mongoose.model("Message", messageSchema);
