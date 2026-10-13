const crypto = require("crypto");
const CallLog = require("../models/CallLog");
const Order = require("../models/Order");
const Chat = require("../models/Chat");
const User = require("../models/User");
const ApiError = require("../utilities/errors");
const botDispatcher = require("./botDispatcher");

// Calls in progress: callId -> { callerId, calleeId, callLogId, timer }
const activeCalls = new Map();

const CALLABLE_STATUSES = ["ASSIGNED", "ARRIVING", "WAITING", "IN_RIDE"];
const UNANSWERED_LIMIT = 5;
const CALL_COOLDOWN_MS = 2 * 60 * 1000;
const INVITE_TIMEOUT_MS = 30 * 1000;

const formatDuration = (totalSeconds) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

// True when the user takes part in the order or was joined by a dispute
const isOrderCallParticipant = async (order, userId) => {
  const key = String(userId);
  if (
    String(order.passengerId) === key ||
    (order.driverId && String(order.driverId) === key)
  ) {
    return true;
  }
  if (order.chatId) {
    const chat = await Chat.findById(order.chatId).select("members");
    return Boolean(chat?.members.some((member) => String(member) === key));
  }
  return false;
};

// Status window: ASSIGNED..IN_RIDE, plus 30 minutes after termination
const assertCallsAllowed = async (order) => {
  if (CALLABLE_STATUSES.includes(order.status)) return;

  if (TERMINAL_WITH_WINDOW(order.status)) {
    const chat = order.chatId ? await Chat.findById(order.chatId).select("closedAt") : null;
    const windowEnd = chat?.closedAt;
    if (windowEnd && new Date() <= new Date(windowEnd)) return;
    throw new ApiError(409, "Звонки по этому заказу уже закрыты");
  }

  throw new ApiError(409, "Звонки доступны после назначения водителя");
};

const TERMINAL_WITH_WINDOW = (status) =>
  ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(status);

// After 5 unanswered calls in a row the caller pauses for 2 minutes
const checkUnansweredLimit = async (callerId) => {
  const recent = await CallLog.find({
    callerId,
    result: { $in: ["missed", "declined", "cancelled"] },
  })
    .sort({ startedAt: -1 })
    .limit(UNANSWERED_LIMIT + 1);

  let consecutive = 0;
  let newestUnanswered = null;
  for (const entry of recent) {
    if (["missed", "declined", "cancelled"].includes(entry.result)) {
      consecutive += 1;
      if (!newestUnanswered) newestUnanswered = entry;
    } else break;
  }

  if (consecutive >= UNANSWERED_LIMIT && newestUnanswered) {
    const cooldownEnd = new Date(newestUnanswered.startedAt).getTime() + CALL_COOLDOWN_MS;
    const remainingMs = cooldownEnd - Date.now();
    if (remainingMs > 0) {
      throw new ApiError(
        429,
        `Слишком много неотвеченных звонков. Повторите через ${Math.ceil(remainingMs / 1000)} с`
      );
    }
  }
};

// Starts a call: validates participants, status, limits; creates the log
const startCall = async ({ orderId, caller, calleeId }) => {
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, "Заказ не найден");

  if (!(await isOrderCallParticipant(order, caller._id)))
    throw new ApiError(403, "Вы не участник этого заказа");
  if (!(await isOrderCallParticipant(order, calleeId)))
    throw new ApiError(400, "Получатель не участник заказа");

  const callee = await User.findById(calleeId).select("banned");
  if (!callee || callee.banned) throw new ApiError(409, "Пользователь недоступен для звонка");
  if (caller.banned) throw new ApiError(403, "Аккаунт заблокирован");

  await assertCallsAllowed(order);
  await checkUnansweredLimit(caller._id);

  for (const [, call] of activeCalls) {
    if (
      String(call.callerId) === String(calleeId) ||
      String(call.calleeId) === String(calleeId)
    ) {
      throw new ApiError(409, "Пользователь сейчас занят другим звонком");
    }
  }

  const callLog = await CallLog.create({
    orderId: order._id,
    chatId: order.chatId,
    kind: "order",
    callerId: caller._id,
    calleeId,
    startedAt: new Date(),
  });

  return { callId: String(callLog._id), order };
};

// Registers an in-memory call with the 30 s invite timeout
const trackCall = (io, { callId, callerId, calleeId, onMissed }) => {
  const timer = setTimeout(async () => {
    if (!activeCalls.has(callId)) return;
    await finalizeCall(io, {
      callId,
      result: "missed",
      endedBy: null,
      notify: true,
    });
    if (onMissed) onMissed();
  }, INVITE_TIMEOUT_MS);

  activeCalls.set(callId, { callLogId: callId, callerId, calleeId, timer });
};

const answerCall = async (callId, userId) => {
  const call = activeCalls.get(String(callId));
  if (!call) throw new ApiError(404, "Звонок не найден или уже завершён");
  if (String(call.calleeId) !== String(userId))
    throw new ApiError(403, "Отвечать может только получатель звонка");

  if (call.timer) clearTimeout(call.timer);

  await CallLog.updateOne(
    { _id: callId, answeredAt: { $exists: false } },
    { $set: { answeredAt: new Date() } }
  );
  call.answered = true;
};

const finalizeCall = async (io, { callId, result, endedBy, notify = false }) => {
  const key = String(callId);
  const call = activeCalls.get(key);
  activeCalls.delete(key);

  if (call?.timer) clearTimeout(call.timer);

  const callLog = await CallLog.findById(key);
  if (!callLog || callLog.result) return callLog;

  const endedAt = new Date();
  const durationSec = callLog.answeredAt
    ? Math.max(0, Math.round((endedAt - new Date(callLog.answeredAt)) / 1000))
    : 0;

  callLog.result = result;
  callLog.endedAt = endedAt;
  callLog.durationSec = durationSec;
  await callLog.save();

  if (callLog.chatId) {
    let text;
    if (result === "answered") text = `Звонок ${formatDuration(durationSec)}`;
    else if (result === "missed") text = "Пропущенный звонок";
    else if (result === "declined") text = "Звонок отклонён";
    else text = "Звонок отменён";

    await botDispatcher.postSystemMessage(callLog.chatId, text);
  }

  if (io) {
    const payload = { callId: key, result, durationSec, endedBy };
    if (call) {
      io.to(`user:${call.callerId}`).emit("call:end", payload);
      io.to(`user:${call.calleeId}`).emit("call:end", payload);
    }
  }

  return callLog;
};

// Both parties must belong to the call to exchange signals
const assertCallParty = (callId, userId) => {
  const call = activeCalls.get(String(callId));
  if (!call) throw new ApiError(404, "Звонок не найден или уже завершён");
  const key = String(userId);
  if (String(call.callerId) !== key && String(call.calleeId) !== key)
    throw new ApiError(403, "Вы не участник этого звонка");
  return call;
};

const getPeerId = (callId, userId) => {
  const call = activeCalls.get(String(callId));
  if (!call) return null;
  return String(call.callerId) === String(userId) ? call.calleeId : call.callerId;
};

// Finalizes calls of a disconnected user
const handleDisconnect = async (io, userId) => {
  for (const [callId, call] of activeCalls) {
    if (String(call.callerId) === String(userId) || String(call.calleeId) === String(userId)) {
      await finalizeCall(io, {
        callId,
        result: call.answered ? "answered" : "missed",
        endedBy: userId,
      });
    }
  }
};

// Temporary TURN credentials bound to the user (REST API, concept 1.7.1)
const buildIceServers = (userId) => {
  const iceServers = [];

  if (process.env.TURN_URL && process.env.TURN_SECRET) {
    const lifetimeSec = 3600;
    const username = `${Math.floor(Date.now() / 1000) + lifetimeSec}:${userId}`;
    const credential = crypto
      .createHmac("sha1", process.env.TURN_SECRET)
      .update(username)
      .digest("base64");

    iceServers.push({
      urls: process.env.TURN_URL,
      username,
      credential,
    });
  }

  // Fallback for local development without TURN
  iceServers.push({ urls: "stun:stun.l.google.com:19302" });

  return iceServers;
};

module.exports = {
  activeCalls,
  assertCallsAllowed,
  startCall,
  trackCall,
  answerCall,
  finalizeCall,
  assertCallParty,
  getPeerId,
  handleDisconnect,
  buildIceServers,
  isOrderCallParticipant,
  formatDuration,
};
