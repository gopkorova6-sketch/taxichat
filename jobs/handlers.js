const Order = require("../models/Order");
const Chat = require("../models/Chat");
const City = require("../models/City");
const Zone = require("../models/Zone");
const Membership = require("../models/Membership");
const DriverProfile = require("../models/DriverProfile");
const Favorite = require("../models/Favorite");
const { transition, assignAtomically } = require("../services/orderService");
const botDispatcher = require("../services/botDispatcher");
const { emitOrderEvents } = require("../utilities/sockets");
const { recalcCityStatus } = require("../utilities/cityStatus");

const SYSTEM_ACTOR = { userId: undefined, role: "system" };

// Every handler is idempotent: it re-checks the current state before acting.

// Cascade step of the order fan-out (concept 1.6): favorites, zone, neighbor
// zones, city. Each step fires only while the order is still PUBLISHED.
const runCascadeStep = async ({ orderId, step }) => {
  const order = await Order.findById(orderId);
  if (!order || order.status !== "PUBLISHED" || order.mode === "direct") return;

  const events = [];
  const card = { orderId: order._id };

  if (step === "favorites") {
    // Favorite drivers of the passenger receive the card exclusively first
    const favorites = await Favorite.find({ passengerId: order.passengerId }).select(
      "driverId"
    );
    for (const favorite of favorites) {
      events.push({
        room: `user:${favorite.driverId}`,
        event: "order:new",
        payload: { ...card, exclusive: true },
      });
    }
  } else if (step === "zone") {
    events.push({ room: `zone:${order.fromZone}`, event: "order:new", payload: card });
  } else if (step === "neighbors") {
    const zone = await Zone.findById(order.fromZone).select("neighbors");
    for (const neighborId of zone?.neighbors ?? []) {
      events.push({ room: `zone:${neighborId}`, event: "order:new", payload: card });
    }
  } else if (step === "city") {
    events.push({ room: `city:${order.cityId}`, event: "order:new", payload: card });
    const dispatchers = await Membership.find({
      cityId: order.cityId,
      role: "dispatcher",
      status: "ACTIVE",
    }).select("userId");
    for (const dispatcher of dispatchers) {
      events.push({
        room: `user:${dispatcher.userId}`,
        event: "order:new",
        payload: card,
      });
    }
  }

  emitOrderEvents(events);
};

// Expiry of a published order (concept 1.6): broadcast orders get EXPIRED,
// direct orders get CANCELLED with a republish suggestion
const runOrderExpire = async ({ orderId }) => {
  const order = await Order.findById(orderId);
  if (!order || order.status !== "PUBLISHED") return;

  let events;
  if (order.mode === "direct") {
    ({ events } = await transition(order, "cancel", SYSTEM_ACTOR, {
      reason: "Водитель не ответил на заказ",
    }));
    await botDispatcher.postSystemMessage(
      order.chatId,
      "Вы можете опубликовать заказ для всех водителей города"
    );
  } else {
    ({ events } = await transition(order, "expire", SYSTEM_ACTOR));
    await botDispatcher.postSystemMessage(
      order.chatId,
      "Время заказа истекло. Вы можете повторить заказ"
    );
  }

  emitOrderEvents(events);
};

// Waiting timer: after waitingMinutes the driver may mark a no-show
const runWaitingTimeout = async ({ orderId }) => {
  const order = await Order.findById(orderId);
  if (!order || order.status !== "WAITING") return;
  await botDispatcher.postSystemMessage(
    order.chatId,
    "Время ожидания истекло. Водитель может отметить неявку пассажира"
  );
};

// Scheduled order activation: starts the cascade before the ride
const runPreorderActivate = async ({ orderId }) => {
  const order = await Order.findById(orderId).populate("cityId", "settings");
  if (!order || order.status !== "PUBLISHED") return;
  if (order.when?.type !== "scheduled") return;

  const timeouts = order.cityId?.settings?.cascadeTimeouts ?? {};
  const steps = [
    ["favorites", 0],
    ["zone", timeouts.favorites ?? 20],
    ["neighbors", timeouts.zone ?? 60],
    ["city", timeouts.neighbors ?? 120],
  ];
  const agenda = require("./index").getAgenda();
  if (!agenda) return;  for (const [step, delaySec] of steps) {
    await agenda.schedule(
      new Date(Date.now() + delaySec * 1000),
      "order:cascade",
      { orderId: String(order._id), step }
    );
  }
};

// Reminder for assigned preorders (concept 1.6)
const runPreorderReminder = async ({ orderId }) => {
  const order = await Order.findById(orderId);
  if (!order) return;
  if (!["ASSIGNED", "ARRIVING"].includes(order.status)) return;
  if (order.when?.type !== "scheduled") return;
  await botDispatcher.postSystemMessage(
    order.chatId,
    "Напоминание: запланированная поездка скоро начнётся"
  );
};

// Auto-offline drivers without a fresh heartbeat (concept 1.8)
const runHeartbeatSweep = async () => {
  const staleProfiles = await DriverProfile.find({
    shift: "online",
    lastSeen: { $lt: new Date(Date.now() - 90 * 1000) },
  }).select("_id membershipId");

  for (const profile of staleProfiles) {
    profile.shift = "offline";
    await profile.save();
  }

  if (staleProfiles.length === 0) return 0;

  // Reset inCall flags that survived a lost connection (safety sweep)
  await DriverProfile.updateMany(
    { inCall: true, shift: "offline" },
    { $set: { inCall: false } }
  );

  const memberships = await Membership.find({
    _id: { $in: staleProfiles.map((profile) => profile.membershipId) },
  }).select("cityId userId");

  const events = memberships.map((membership) => ({
    room: `city:${membership.cityId}`,
    event: "driver:presence",
    payload: { driverId: String(membership.userId), shift: "offline" },
  }));
  emitOrderEvents(events);

  return staleProfiles.length;
};

// City statuses are recalculated automatically (concept 1.4)
const runCityStatusRecalc = async () => {
  const cities = await City.find({ status: { $ne: "SUSPENDED" } }).select("_id");
  for (const city of cities) {
    await recalcCityStatus(city._id);
  }
  return cities.length;
};

// Idle direct chats close 60 minutes after the last activity (concept 1.6)
const runDirectChatCleanup = async () => {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000);
  const result = await Chat.updateMany(
    {
      type: "direct",
      orderId: null,
      closedAt: null,
      lastActivityAt: { $lt: cutoff },
    },
    { $set: { closedAt: new Date() } }
  );
  return result.modifiedCount ?? 0;
};

module.exports = {
  SYSTEM_ACTOR,
  runCascadeStep,
  runOrderExpire,
  runWaitingTimeout,
  runPreorderActivate,
  runPreorderReminder,
  runHeartbeatSweep,
  runCityStatusRecalc,
  runDirectChatCleanup,
};
