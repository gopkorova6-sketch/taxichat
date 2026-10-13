const callService = require("../services/callService");
const User = require("../models/User");
const ApiError = require("../utilities/errors");

// Signaling for calls inside order chats (concept 1.7.1): the server relays
// WebRTC signals only between participants of the same call. The client uses
// iceTransportPolicy 'relay' so IP addresses are not exposed (TURN).
exports.registerOrderCallHandlers = (io, socket) => {
  socket.on("call:invite", async (payload, acknowledgementFn) => {
    try {
      const { orderId, target, signalData } = payload ?? {};
      if (!socket.userId || !orderId || !target)
        throw new ApiError(400, "Некорректный вызов");
      if (String(target) === String(socket.userId))
        throw new ApiError(400, "Нельзя позвонить самому себе");

      const caller = await User.findById(socket.userId).select("banned name");
      if (!caller || caller.banned) throw new ApiError(403, "Аккаунт заблокирован");

      const { callId } = await callService.startCall({
        orderId,
        caller,
        calleeId: target,
      });

      const calleeName = (await User.findById(target).select("name"))?.name;

      callService.trackCall(io, {
        callId,
        callerId: socket.userId,
        calleeId: target,
      });

      io.to(`user:${target}`).emit("call:invite", {
        callId,
        orderId,
        kind: "order",
        from: socket.userId,
        fromName: caller.name,
        toName: calleeName,
        signalData,
      });

      if (acknowledgementFn) acknowledgementFn({ callId });
    } catch (error) {
      if (acknowledgementFn) acknowledgementFn({ error: error.message });
    }
  });

  socket.on("call:answer", async (payload) => {
    try {
      const { callId, signalData } = payload ?? {};
      await callService.answerCall(callId, socket.userId);

      const peer = callService.getPeerId(callId, socket.userId);
      if (peer) {
        io.to(`user:${peer}`).emit("call:answer", { callId, signalData });
      }
    } catch (error) {
      socket.emit("call:error", { callId: payload?.callId, error: error.message });
    }
  });

  socket.on("call:ice", async (payload) => {
    try {
      const { callId, candidate } = payload ?? {};
      callService.assertCallParty(callId, socket.userId);

      const peer = callService.getPeerId(callId, socket.userId);
      if (peer) {
        io.to(`user:${peer}`).emit("call:ice", { callId, candidate });
      }
    } catch (error) {
      socket.emit("call:error", { callId: payload?.callId, error: error.message });
    }
  });

  socket.on("call:end", async (payload) => {
    try {
      const { callId, reason } = payload ?? {};
      const call = callService.assertCallParty(callId, socket.userId);

      const result =
        reason === "decline"
          ? "declined"
          : call.answered
            ? "answered"
            : reason === "cancel"
              ? "cancelled"
              : "missed";

      await callService.finalizeCall(io, { callId, result, endedBy: socket.userId });
    } catch (error) {
      socket.emit("call:error", { callId: payload?.callId, error: error.message });
    }
  });
};
