const { z } = require("zod");
const mongoose = require("mongoose");
const Chat = require("../models/Chat");
const Message = require("../models/Message");
const City = require("../models/City");
const ApiError = require("../utilities/errors");
const catchAsyncError = require("../utilities/catchAsyncError");
const { validateBody } = require("../utilities/catchAsyncError");
const { emitOrderEvents } = require("../utilities/sockets");

const PHONE_PATTERN = /(\+?7|8)[\s\-()]?\d{3}[\s\-()]?\d{3}[\s\-()]?\d{2}[\s\-()]?\d{2}/;
const URL_PATTERN = /(https?:\/\/|www\.)\S+|\b[\w-]+\.(?:ru|рф|com|net|org)\b/i;

const messageSchema = z.object({
  body: z.string().trim().min(1, "Введите сообщение").max(2000, "Сообщение слишком длинное"),
});

const offerSchema = z.object({
  priceText: z.string().trim().min(1, "Укажите цену").max(50),
  etaMin: z.number().int().min(1, "Укажите время подачи").max(180),
});

exports.messageSchema = messageSchema;
exports.offerSchema = offerSchema;

const getDirectChatForUser = async (chatId, userId) => {
  if (!mongoose.isValidObjectId(chatId))
    throw new ApiError(400, "Некорректный идентификатор чата");

  const chat = await Chat.findById(chatId);
  if (!chat) throw new ApiError(404, "Чат не найден");
  if (chat.type !== "direct" && chat.type !== "order")
    throw new ApiError(400, "Неподдерживаемый тип чата");

  const isMember = chat.members.some((member) => String(member) === String(userId));
  if (!isMember) throw new ApiError(403, "Нет доступа к этому чату");

  return chat;
};

const serializeMessage = (message, userId) => ({
  _id: message._id,
  kind: message.kind,
  body: message.body,
  meta: message.meta,
  senderType: message.senderType,
  senderId: message.senderId?._id ?? message.senderId,
  senderName: message.senderId?.name,
  mine: message.senderId
    ? String(message.senderId._id ?? message.senderId) === String(userId)
    : false,
  createdAt: message.createdAt,
});

// GET /api/chats/:id/messages?before=
exports.listChatMessages = catchAsyncError(async (req, res) => {
  const chat = await getDirectChatForUser(req.params.id, req.user._id);

  const before = req.query.before ? new Date(req.query.before) : null;
  const filter = { chatId: chat._id };
  if (before) filter.createdAt = { $lt: before };

  const messages = await Message.find(filter)
    .sort({ createdAt: -1 })
    .limit(50)
    .populate("senderId", "username name");

  res.json({
    status: "success",
    data: { messages: messages.reverse().map((message) => serializeMessage(message, req.user._id)) },
  });
});

// POST /api/chats/:id/messages — text message in the direct chat
exports.sendChatMessage = [
  validateBody(messageSchema),
  catchAsyncError(async (req, res) => {
    const chat = await getDirectChatForUser(req.params.id, req.user._id);

    const city = await City.findById(chat.cityId).select("settings.filterContacts");
    if (city?.settings?.filterContacts) {
      if (PHONE_PATTERN.test(req.body.body) || URL_PATTERN.test(req.body.body)) {
        throw new ApiError(
          400,
          "Отправка телефонных номеров и ссылок запрещена настройками города"
        );
      }
    }

    const message = await Message.create({
      chatId: chat._id,
      senderId: req.user._id,
      senderType: "user",
      kind: "text",
      body: req.body.body,
    });
    await Chat.updateOne({ _id: chat._id }, { $set: { lastActivityAt: new Date() } });

    // Direct chats have no room; notify each member personally
    const events = chat.members
      .filter((member) => String(member) !== String(req.user._id))
      .map((member) => ({
        room: `user:${member}`,
        event: "chat:message",
        payload: {
          chatId: String(chat._id),
          messageId: message._id,
          senderId: req.user._id,
          senderName: req.user.name,
          body: message.body,
          createdAt: message.createdAt,
        },
      }));
    emitOrderEvents(events);

    res.status(201).json({
      status: "success",
      data: { message: serializeMessage(message, req.user._id) },
    });
  }),
];

// POST /api/chats/:id/offers — driver sends an offer card (price + ETA) that
// the passenger can accept to prefill the order form (concept 1.6)
exports.sendChatOffer = [
  validateBody(offerSchema),
  catchAsyncError(async (req, res) => {
    const chat = await getDirectChatForUser(req.params.id, req.user._id);

    const message = await Message.create({
      chatId: chat._id,
      senderId: req.user._id,
      senderType: "user",
      kind: "offer",
      body: `Предложение: ${req.body.priceText}, подача через ${req.body.etaMin} мин`,
      meta: {
        priceText: req.body.priceText,
        etaMin: req.body.etaMin,
        driverId: req.user._id,
      },
    });
    await Chat.updateOne({ _id: chat._id }, { $set: { lastActivityAt: new Date() } });

    const events = chat.members
      .filter((member) => String(member) !== String(req.user._id))
      .map((member) => ({
        room: `user:${member}`,
        event: "chat:message",
        payload: {
          chatId: String(chat._id),
          messageId: message._id,
          kind: "offer",
          senderId: req.user._id,
          senderName: req.user.name,
          meta: message.meta,
          createdAt: message.createdAt,
        },
      }));
    emitOrderEvents(events);

    res.status(201).json({
      status: "success",
      data: { message: serializeMessage(message, req.user._id) },
    });
  }),
];
