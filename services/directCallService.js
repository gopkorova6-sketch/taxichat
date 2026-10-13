const mongoose = require("mongoose");
const Chat = require("../models/Chat");
const City = require("../models/City");
const Membership = require("../models/Membership");
const DriverProfile = require("../models/DriverProfile");
const CallLog = require("../models/CallLog");
const Block = require("../models/Block");
const ApiError = require("../utilities/errors");

const HEARTBEAT_WINDOW_MS = 90 * 1000;

// Direct call to a free driver (concept 1.6): passenger picks a driver from
// the list, calls him in-app and, once agreed, places an order for him.

const findOrCreateDirectChat = async ({ passengerId, driverId, cityId }) => {
  const existing = await Chat.findOne({
    type: "direct",
    cityId,
    members: { $all: [passengerId, driverId], $size: 2 },
  });
  if (existing) return existing;

  return Chat.create({
    type: "direct",
    cityId,
    members: [passengerId, driverId],
  });
};

const getDriverContext = async (driverId, cityId) => {
  const membership = await Membership.findOne({
    userId: driverId,
    role: "driver",
    status: "ACTIVE",
    ...(cityId && { cityId }),
  });
  if (!membership) return null;
  const profile = await DriverProfile.findOne({ membershipId: membership._id });
  if (!profile) return null;
  return { membership, profile };
};

const isBlockedPair = async (a, b) => {
  const block = await Block.findOne({
    $or: [
      { userId: a, blockedUserId: b },
      { userId: b, blockedUserId: a },
    ],
  });
  return Boolean(block);
};

// Validates the driver, the city settings and the passenger's call limits
const assertDirectCallAllowed = async ({ passenger, driverId, cityId }) => {
  const city = await City.findById(cityId).select("settings");
  if (!city) throw new ApiError(404, "Город не найден");
  if (city.settings?.directCallsEnabled === false)
    throw new ApiError(403, "Прямые вызовы водителей отключены в этом городе");

  const passengerMembership = await Membership.findOne({
    userId: passenger._id,
    cityId,
    role: "passenger",
    status: "ACTIVE",
  });
  if (!passengerMembership)
    throw new ApiError(403, "Вы не пассажир этого города");

  const driver = await getDriverContext(driverId, cityId);
  if (!driver) throw new ApiError(404, "Водитель не найден в этом городе");

  if (driver.profile.shift !== "online")
    throw new ApiError(409, "Водитель сейчас не на линии");
  if (!driver.profile.lastSeen || Date.now() - new Date(driver.profile.lastSeen).getTime() > HEARTBEAT_WINDOW_MS)
    throw new ApiError(409, "Водитель сейчас не на линии");
  if (!driver.profile.acceptDirectCalls)
    throw new ApiError(409, "Водитель не принимает прямые звонки");
  if (driver.profile.inCall)
    throw new ApiError(409, "Водитель сейчас разговаривает");

  if (await isBlockedPair(passenger._id, driverId))
    throw new ApiError(409, "Вызов недоступен: блокировка");

  const limits = city.settings.directCallLimits ?? {};
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const recentCalls = await CallLog.find({
    kind: "direct",
    callerId: passenger._id,
    startedAt: { $gte: hourAgo },
  }).select("calleeId result");

  const maxPerHour = limits.maxPerHour ?? 10;
  const distinctCallees = new Set(recentCalls.map((call) => String(call.calleeId)));
  if (distinctCallees.size >= maxPerHour)
    throw new ApiError(429, `Не более ${maxPerHour} вызовов разным водителям в час`);

  const maxUnanswered = limits.maxUnansweredPerDriver ?? 3;
  const unansweredToDriver = recentCalls.filter(
    (call) =>
      String(call.calleeId) === String(driverId) &&
      ["missed", "declined", "cancelled"].includes(call.result ?? "")
  ).length;
  if (unansweredToDriver >= maxUnanswered)
    throw new ApiError(429, `Слишком много неотвеченных вызовов этому водителю`);

  return { driver };
};

// One outgoing call at a time (checked against in-memory active calls)
const assertNoConcurrentCall = (activeCalls, callerId) => {
  for (const [, call] of activeCalls) {
    if (String(call.callerId) === String(callerId)) {
      throw new ApiError(409, "У вас уже есть исходящий вызов");
    }
  }
};

const setInCall = async (driverId, inCall) => {
  const membership = await Membership.findOne({ userId: driverId, role: "driver" }).select("_id");
  if (!membership) return null;
  return DriverProfile.findOneAndUpdate(
    { membershipId: membership._id },
    { inCall },
    { new: true }
  );
};

// Starts a direct call: creates the direct chat, marks the driver inCall
const startDirectCall = async ({ passenger, driverId, cityId }) => {
  const { driver } = await assertDirectCallAllowed({ passenger, driverId, cityId });

  const chat = await findOrCreateDirectChat({
    passengerId: passenger._id,
    driverId,
    cityId,
  });

  const callLog = await CallLog.create({
    chatId: chat._id,
    kind: "direct",
    callerId: passenger._id,
    calleeId: driverId,
    startedAt: new Date(),
  });

  await setInCall(driverId, true);

  return { callId: String(callLog._id), chat };
};

module.exports = {
  findOrCreateDirectChat,
  assertDirectCallAllowed,
  assertNoConcurrentCall,
  startDirectCall,
  setInCall,
  getDriverContext,
  isBlockedPair,
};
