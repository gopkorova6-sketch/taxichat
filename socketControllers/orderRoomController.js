const Order = require("../models/Order");
const Membership = require("../models/Membership");
const User = require("../models/User");
const { canReviewInCity } = require("../utilities/rbac");

// Live order room: the order's participants (passenger, assigned driver) and
// the city dispatchers subscribe to "order:<id>" to receive order:status and
// order:offer as they happen, without polling.
const loadRequestLike = async (userId) => {
  const user = await User.findById(userId).select("isSuperadmin");
  const memberships = await Membership.find({ userId, status: "ACTIVE" }).select("cityId role status zones");
  return { user, memberships };
};

exports.orderRoomController = (io, socket) => {
  socket.on("order:join", async (payload, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    try {
      const orderId = payload?.orderId;
      if (!orderId || !socket.userId) return reply({ ok: false, error: "bad request" });
      const order = await Order.findById(orderId).select("passengerId driverId cityId");
      if (!order) return reply({ ok: false, error: "not found" });

      const userId = String(socket.userId);
      const isParticipant =
        String(order.passengerId) === userId ||
        (order.driverId && String(order.driverId) === userId);
      let allowed = isParticipant;
      if (!allowed) {
        const { user, memberships } = await loadRequestLike(userId);
        allowed = await canReviewInCity({ user, memberships }, order.cityId);
      }
      if (!allowed) return reply({ ok: false, error: "forbidden" });

      socket.join(`order:${orderId}`);
      reply({ ok: true });
    } catch (error) {
      reply({ ok: false, error: error.message });
    }
  });

  socket.on("order:leave", (payload) => {
    if (payload?.orderId) socket.leave(`order:${payload.orderId}`);
  });
};
