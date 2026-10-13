const Order = require("../models/Order");
const Chat = require("../models/Chat");
const Message = require("../models/Message");
const Membership = require("../models/Membership");
const DriverProfile = require("../models/DriverProfile");
const ApiError = require("../utilities/errors");
const botDispatcher = require("./botDispatcher");

const ORDER_STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "ASSIGNED",
  "ARRIVING",
  "WAITING",
  "IN_RIDE",
  "COMPLETED",
  "EXPIRED",
  "CANCELLED",
  "NO_SHOW",
  "DISPUTE",
];

// Allowed transitions with actor roles (concept 1.6). "driver"/"passenger"
// further narrow to the assigned driver / order owner in assertActor.
const TRANSITIONS = {
  publish: { from: ["DRAFT"], to: "PUBLISHED", roles: ["passenger"] },
  assign: {
    from: ["PUBLISHED"],
    to: "ASSIGNED",
    roles: ["passenger", "driver", "dispatcher", "system"],
  },
  arrive: { from: ["ASSIGNED"], to: "ARRIVING", roles: ["driver"] },
  wait: { from: ["ARRIVING"], to: "WAITING", roles: ["driver"] },
  start: { from: ["WAITING"], to: "IN_RIDE", roles: ["driver"] },
  undo_start: { from: ["IN_RIDE"], to: "WAITING", roles: ["driver"] },
  finish: { from: ["IN_RIDE"], to: "COMPLETED", roles: ["driver"] },
  no_show: { from: ["WAITING"], to: "NO_SHOW", roles: ["driver"] },
  cancel: {
    from: ["DRAFT", "PUBLISHED", "ASSIGNED", "ARRIVING", "WAITING", "IN_RIDE"],
    to: "CANCELLED",
    // "system" cancels timed-out direct orders (concept 1.6)
    roles: ["passenger", "driver", "dispatcher", "system"],
  },
  dispute: {
    from: ["PUBLISHED", "ASSIGNED", "ARRIVING", "WAITING", "IN_RIDE"],
    to: "DISPUTE",
    roles: ["passenger", "driver", "dispatcher"],
  },
  expire: { from: ["PUBLISHED"], to: "EXPIRED", roles: ["system"] },
};

const SYSTEM_MESSAGES = {
  publish: "Заказ опубликован",
  assign: "Водитель назначен: адреса и телефон водителя открыты в чате",
  arrive: "Водитель выехал",
  wait: "Водитель на месте",
  start: "Поездка началась",
  undo_start: "Водитель отменил начало поездки",
  finish: "Поездка завершена",
  no_show: "Водитель отметил, что пассажир не вышел",
  cancel: "Заказ отменён",
  dispute: "Открыт спор: к чату подключается диспетчер",
  expire: "Время заказа истекло",
};

const TERMINAL_STATUSES = ["COMPLETED", "CANCELLED", "NO_SHOW", "EXPIRED"];

const PENALTY_BAN_THRESHOLD = 10;
const PENALTY_STATUSES = ["ASSIGNED", "ARRIVING", "WAITING", "IN_RIDE"];

// Late cancels by participants add penalty points; the threshold auto-bans
// the account (concept 1.9)
const applyPenalty = async (order, event, actor, previousStatus) => {
  if (event !== "cancel") return;
  if (!PENALTY_STATUSES.includes(previousStatus)) return;
  if (!["passenger", "driver"].includes(actor.role) || !actor.userId) return;

  const User = require("../models/User");
  const { logAudit } = require("../utilities/audit");

  const user = await User.findById(actor.userId);
  if (!user || user.isSuperadmin) return;

  user.penaltyPoints = (user.penaltyPoints ?? 0) + 1;
  if (user.penaltyPoints >= PENALTY_BAN_THRESHOLD && !user.banned) {
    user.banned = true;
  }
  await user.save();

  await logAudit({
    actorId: actor.userId,
    action: user.banned ? "penalty.autoBan" : "penalty.added",
    targetType: "User",
    targetId: user._id,
    payload: { orderId: order._id, points: user.penaltyPoints },
  });
};

// Validates the event against the table and the actor's rights
const assertTransition = (order, event, actor) => {
  const transition = TRANSITIONS[event];
  if (!transition) throw new ApiError(400, "Неизвестное событие заказа");
  if (!transition.from.includes(order.status)) {
    throw new ApiError(
      409,
      `Действие недоступно: заказ в статусе ${order.status}`
    );
  }
  if (!transition.roles.includes(actor.role)) {
    throw new ApiError(403, "Недостаточно прав для этого действия");
  }

  if (actor.role === "passenger") {
    if (String(order.passengerId) !== String(actor.userId))
      throw new ApiError(403, "Это не ваш заказ");
  }
  if (actor.role === "driver") {
    const isAssigned =
      order.driverId && String(order.driverId) === String(actor.userId);
    // The target driver of a direct order may decline it before assignment
    const isDirectTarget =
      order.mode === "direct" &&
      order.status === "PUBLISHED" &&
      String(order.targetDriverId) === String(actor.userId);
    if (!isAssigned && !isDirectTarget)
      throw new ApiError(403, "Заказ назначен не вам");
  }
  // dispatcher membership in the order city is checked by the caller
};

// Driver presence: busy while assigned, online again afterwards (concept 1.8).
// DriverProfile is keyed by membership, so resolve it first.
const setDriverShift = async (userId, shift) => {
  const membership = await Membership.findOne({ userId, role: "driver" }).select("_id");
  if (!membership) return null;
  return DriverProfile.findOneAndUpdate(
    { membershipId: membership._id },
    { shift },
    { new: true }
  );
};

// Adds the bot system message, refreshes the pinned order card and posts
// the quick action buttons for the new status (concept 1.7)
const updateOrderChat = async (order, { membersToAdd = [], systemText } = {}) => {
  if (!order.chatId) return;

  if (membersToAdd.length > 0) {
    await Chat.updateOne(
      { _id: order.chatId },
      { $addToSet: { members: { $each: membersToAdd } } }
    );
  }

  if (systemText) {
    await botDispatcher.postSystemMessage(order.chatId, systemText);
  }

  await botDispatcher.upsertOrderCard(order);
  await botDispatcher.postActionButtons(order.chatId, order.status);

  // Messages of finished orders expire after 90 days (concept 1.10)
  if (TERMINAL_STATUSES.includes(order.status)) {
    const expireAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    await Message.updateMany({ chatId: order.chatId }, { $set: { expireAt } });
    await Chat.updateOne(
      { _id: order.chatId },
      { $set: { closedAt: new Date(Date.now() + 30 * 60 * 1000) } }
    );
  }
};

// The single entry point for every status change (concept 1.6).
// Writes statusLog, posts a bot system message to the order chat and returns
// socket events for the caller to emit.
const transition = async (order, event, actor, { reason } = {}) => {
  assertTransition(order, event, actor);

  if (event === "cancel" && !reason)
    throw new ApiError(400, "Укажите причину отмены");

  const previousStatus = order.status;
  order.status = TRANSITIONS[event].to;
  order.statusLog.push({
    status: order.status,
    by: actor.userId ?? undefined,
    ...(reason && { reason }),
    at: new Date(),
  });

  if (event === "assign" && actor.role === "driver") {
    order.driverId = actor.userId;
  }

  let membersToAdd = [];
  let systemText = SYSTEM_MESSAGES[event];

  if (event === "dispute") {
    const dispatchers = await Membership.find({
      cityId: order.cityId,
      role: "dispatcher",
      status: "ACTIVE",
    }).select("userId");
    membersToAdd = dispatchers.map((item) => item.userId);
    systemText = reason
      ? `Открыт спор: ${reason}. К чату подключается диспетчер`
      : SYSTEM_MESSAGES.dispute;
  }

  if (event === "cancel" && reason) {
    systemText = `Заказ отменён: ${reason}`;
  }

  if (event === "assign" && order.driverId) {
    membersToAdd.push(order.driverId);
  }

  await order.save();

  await updateOrderChat(order, { membersToAdd, systemText });

  if (event === "assign" && order.driverId) {
    await setDriverShift(order.driverId, "busy");
  }
  if (TERMINAL_STATUSES.includes(order.status) && order.driverId) {
    await setDriverShift(order.driverId, "online");
  }

  // Waiting timer for the no-show window (concept 1.6)
  if (event === "wait") {
    const { scheduleWaitingTimer } = require("../jobs/index");
    const City = require("../models/City");
    const city = await City.findById(order.cityId).select("settings.waitingMinutes");
    await scheduleWaitingTimer(order, city?.settings?.waitingMinutes ?? 10);
  }

  // Penalty points for late cancels (concept 1.9)
  await applyPenalty(order, event, actor, previousStatus);

  const events = [
    {
      room: `order:${order._id}`,
      event: "order:status",
      payload: {
        orderId: order._id,
        status: order.status,
        previousStatus,
        by: actor.userId,
      },
    },
  ];

  return { order, events, previousStatus };
};

// Atomic assignment used by every assign path (concept 1.6: first-take race)
const assignAtomically = async (orderId, driverId, actor, { priceAgreed } = {}) => {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, status: "PUBLISHED" },
    {
      $set: {
        status: "ASSIGNED",
        driverId,
        ...(priceAgreed && { priceAgreed }),
      },
      $push: {
        statusLog: { status: "ASSIGNED", by: actor.userId, at: new Date() },
      },
    },
    { new: true }
  );

  if (!order) throw new ApiError(409, "Заказ уже назначен или недоступен");

  await updateOrderChat(order, {
    membersToAdd: [driverId],
    systemText: SYSTEM_MESSAGES.assign,
  });

  await setDriverShift(driverId, "busy");

  const events = [
    {
      room: `order:${order._id}`,
      event: "order:status",
      payload: {
        orderId: order._id,
        status: "ASSIGNED",
        previousStatus: "PUBLISHED",
        by: actor.userId,
      },
    },
  ];

  return { order, events };
};

module.exports = {
  ORDER_STATUSES,
  TRANSITIONS,
  SYSTEM_MESSAGES,
  transition,
  assignAtomically,
};
