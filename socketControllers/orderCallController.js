const callService = require("../services/callService");
const directCallService = require("../services/directCallService");
const User = require("../models/User");
const ApiError = require("../utilities/errors");

// Signaling for voice calls (concept 1.6 / 1.7.1):
// - kind "order": calls between participants of an order chat;
// - kind "direct": a passenger calling a free driver before placing an order.
// The server relays WebRTC signals only between the two parties. The client
// uses iceTransportPolicy 'relay' so IPs are not exposed (TURN).
exports.registerOrderCallHandlers = (io, socket) => {
  socket.on("call:invite", async (payload, acknowledgementFn) => {
    const kind = payload?.kind;
    try {
      const { orderId, target, signalData, cityId } = payload ?? {};
      if (!socket.userId || !target)
        throw new ApiError(400, "Некорректный вызов");
      if (String(target) === String(socket.userId))
        throw new ApiError(400, "Нельзя позвонить самому себе");

      const caller = await User.findById(socket.userId).select("banned name");
      if (!caller || caller.banned) throw new ApiError(403, "Аккаунт заблокирован");

      if (kind === "direct") {
        // Direct call to a free driver, no order yet
        directCallService.assertNoConcurrentCall(
          callService.activeCalls,
          socket.userId
        );

        const { callId, chat } = await directCallService.startDirectCall({
          passenger: caller,
          driverId: target,
          cityId: cityId ?? payload.cityId,
        });

        callService.trackCall(io, {
          callId,
          callerId: socket.userId,
          calleeId: target,
          kind: "direct",
        });

        io.to(`user:${target}`).emit("call:invite", {
          callId,
          chatId: String(chat._id),
          kind: "direct",
          from: socket.userId,
          fromName: caller.name,
          fromRole: payload?.fromRole,
          signalData,
        });

        if (acknowledgementFn) acknowledgementFn({ callId, chatId: String(chat._id) });
        return;
      }

      if (!orderId) throw new ApiError(400, "Некорректный вызов");

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
        kind: "order",
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
      // For direct calls a busy or unavailable driver gets a busy signal
      if (kind === "direct") {
        socket.emit("call:busy", { target: payload?.target, error: error.message });
      }
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
