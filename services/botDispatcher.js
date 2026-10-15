const Message = require("../models/Message");

// Bot-dispatcher behavior (concept 1.7): system texts on every transition,
// quick action buttons per status and the pinned order card.

const CAR_CAPTION = (profile) =>
  profile
    ? [profile.car?.color, profile.car?.plate, profile.car?.brand]
        .filter(Boolean)
        .join(" ")
    : undefined;

// Quick buttons shown in the order chat, filtered by the viewer's role.
// action "text" makes the client send meta.text as a regular message.
const ACTIONS_BY_STATUS = {
  PUBLISHED: [
    { action: "offer", label: "Прислать отклик", roles: ["driver"] },
    { action: "book", label: "🔖 Забронировать на время", roles: ["driver"] },
    { action: "cancel", label: "Отменить заказ", roles: ["passenger"] },
  ],
  BOOKED: [
    { action: "activate", label: "🚕 Приступить к брони", roles: ["driver"] },
    { action: "cancel", label: "Отменить", roles: ["passenger", "driver"] },
  ],
  ASSIGNED: [
    { action: "arrive", label: "Выехал", roles: ["driver"] },
    { action: "cancel", label: "Отменить", roles: ["passenger", "driver"] },
  ],
  ARRIVING: [
    { action: "wait", label: "Я на месте", roles: ["driver"] },
    {
      action: "text",
      label: "Опаздываю на 5 мин",
      roles: ["passenger"],
      text: "Опаздываю на 5 минут",
    },
    { action: "dispute", label: "Открыть спор", roles: ["passenger", "driver"] },
  ],
  WAITING: [
    { action: "start", label: "Поехали", roles: ["driver"] },
    { action: "no_show", label: "Пассажир не вышел", roles: ["driver"] },
    {
      action: "text",
      label: "Жду у подъезда",
      roles: ["passenger"],
      text: "Жду у подъезда",
    },
  ],
  IN_RIDE: [
    { action: "finish", label: "Завершить", roles: ["driver"] },
    { action: "undo_start", label: "Отменить начало поездки", roles: ["driver"] },
  ],
};

const actionsForStatus = (status) => ACTIONS_BY_STATUS[status] ?? [];

// Creates or updates the pinned order summary card (concept 1.7)
const upsertOrderCard = async (order) => {
  const meta = {
    orderId: order._id,
    status: order.status,
    from: order.from?.text,
    to: order.to?.text,
    when: order.when,
    pax: order.pax,
    priceAgreed: order.priceAgreed,
    driverId: order.driverId,
    expiresAt: order.expiresAt,
  };

  const existing = await Message.findOne({
    chatId: order.chatId,
    kind: "order_card",
  }).sort({ createdAt: 1 });

  if (existing) {
    existing.meta = meta;
    await existing.save();
    return existing;
  }

  return Message.create({
    chatId: order.chatId,
    senderType: "bot",
    kind: "order_card",
    body: "Заказ",
    meta,
  });
};

const TERMINAL_STATUSES = ["COMPLETED", "CANCELLED", "NO_SHOW", "EXPIRED"];

// Posts the quick action buttons for the current status. The previous button
// message is removed, so an old "Отменить заказ" never survives a transition,
// and a finished order gets no actions at all.
const postActionButtons = async (chatId, status) => {
  await Message.deleteMany({ chatId, kind: "action" });
  if (TERMINAL_STATUSES.includes(status)) return null;

  const buttons = actionsForStatus(status);
  if (buttons.length === 0) return null;

  return Message.create({
    chatId,
    senderType: "bot",
    kind: "action",
    body: "Доступные действия",
    meta: { buttons },
  });
};

// Posts a system message as the bot
const postSystemMessage = async (chatId, body) =>
  Message.create({
    chatId,
    senderType: "bot",
    kind: "system",
    body,
  });

module.exports = {
  CAR_CAPTION,
  actionsForStatus,
  upsertOrderCard,
  postActionButtons,
  postSystemMessage,
};
