const Order = require("../models/Order");
const app = require("../app");
const request = require("supertest");
const Chat = require("../models/Chat");
const DriverProfile = require("../models/DriverProfile");
const Membership = require("../models/Membership");
const Message = require("../models/Message");
const handlers = require("../jobs/handlers");
const { connectTestDb, disconnectTestDb } = require("./db");
const { setupPilotCity, createOrder } = require("./orderSetup");

beforeAll(async () => {
  await connectTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe("Background job handlers", () => {
  let world;

  beforeEach(async () => {
    world = await setupPilotCity(app);
  });

  it("expires a published broadcast order and posts a retry hint", async () => {
    const created = await createOrder(app, world.passenger, world.city);
    const order = created.body.data.order;

    await handlers.runOrderExpire({ orderId: order._id });

    const expired = await Order.findById(order._id);
    expect(expired.status).toBe("EXPIRED");

    const messages = await Message.find({ chatId: order.chatId });
    expect(messages.some((message) => message.body.includes("истекло"))).toBe(true);
  });

  it("cancels a timed-out direct order with a republish suggestion", async () => {
    const membership = await Membership.findOne({ userId: world.drivers[0].user._id });
    await DriverProfile.findOneAndUpdate(
      { membershipId: membership._id },
      { shift: "online", lastSeen: new Date() }
    );

    const created = await createOrder(app, world.passenger, world.city, {
      targetDriverId: String(world.drivers[0].user._id),
    });
    const order = created.body.data.order;

    await handlers.runOrderExpire({ orderId: order._id });

    const cancelled = await Order.findById(order._id);
    expect(cancelled.status).toBe("CANCELLED");

    const suggestion = await Message.findOne({
      chatId: order.chatId,
      body: "Вы можете опубликовать заказ для всех водителей города",
    });
    expect(suggestion).toBeTruthy();

    // Idempotent: running again changes nothing
    await handlers.runOrderExpire({ orderId: order._id });
    const stillCancelled = await Order.findById(order._id);
    expect(stillCancelled.status).toBe("CANCELLED");
  });

  it("cascade step ignores assigned and direct orders", async () => {
    const broadcast = await createOrder(app, world.passenger, world.city, {
      matchMode: "first_take",
    });
    await request(app)
      .post(`/api/orders/${broadcast.body.data.order._id}/accept`)
      .set("Cookie", world.drivers[0].cookie)
      .send({});

    // No error and no state change
    await handlers.runCascadeStep({
      orderId: broadcast.body.data.order._id,
      step: "zone",
    });
    const order = await Order.findById(broadcast.body.data.order._id);
    expect(order.status).toBe("ASSIGNED");
  });

  it("preorder activation publishes the draft and idempotently skips later", async () => {
    const created = await createOrder(app, world.passenger, world.city, {
      whenType: "scheduled",
      whenAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    });
    const order = created.body.data.order;
    expect(order.status).toBe("DRAFT");

    await handlers.runPreorderActivate({ orderId: order._id });

    const activated = await Order.findById(order._id);
    expect(activated.status).toBe("PUBLISHED");

    const systemMessage = await Message.findOne({
      chatId: order.chatId,
      body: "Заказ опубликован",
    });
    expect(systemMessage).toBeTruthy();

    // Already published orders pass through without changes
    await handlers.runPreorderActivate({ orderId: order._id });
    const stillPublished = await Order.findById(order._id);
    expect(stillPublished.status).toBe("PUBLISHED");
  });

  it("heartbeat sweep sends stale online drivers offline", async () => {
    const membership = await Membership.findOne({ userId: world.drivers[0].user._id });
    await DriverProfile.findOneAndUpdate(
      { membershipId: membership._id },
      { shift: "online", lastSeen: new Date(Date.now() - 5 * 60 * 1000), inCall: true }
    );

    const count = await handlers.runHeartbeatSweep();
    expect(count).toBeGreaterThanOrEqual(1);

    const profile = await DriverProfile.findById(membership._id).catch(() => null);
    const updated = await DriverProfile.findOne({ membershipId: membership._id });
    expect(updated.shift).toBe("offline");
    // inCall flag is reset by the same sweep
    expect(updated.inCall).toBe(false);
  });

  it("city status recalculation runs for every city", async () => {
    const processed = await handlers.runCityStatusRecalc();
    expect(processed).toBeGreaterThanOrEqual(1);
  });

  it("closes idle direct chats after 60 minutes", async () => {
    // A fresh direct chat stays open
    const fresh = await Chat.create({
      type: "direct",
      cityId: world.city._id,
      members: [world.passenger.user._id, world.drivers[0].user._id],
      lastActivityAt: new Date(),
    });
    // An idle one gets closed
    const idle = await Chat.create({
      type: "direct",
      cityId: world.city._id,
      members: [world.passenger.user._id, world.drivers[1].user._id],
      lastActivityAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });
    // Order chats are never touched
    const withOrder = await Chat.create({
      type: "direct",
      cityId: world.city._id,
      orderId: new (require("mongoose").Types.ObjectId)(),
      members: [world.passenger.user._id, world.drivers[2].user._id],
      lastActivityAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });

    await handlers.runDirectChatCleanup();

    const freshAfter = await Chat.findById(fresh._id);
    const idleAfter = await Chat.findById(idle._id);
    const withOrderAfter = await Chat.findById(withOrder._id);

    expect(freshAfter.closedAt ?? null).toBeNull();
    expect(idleAfter.closedAt ?? null).not.toBeNull();
    expect(withOrderAfter.closedAt ?? null).toBeNull();
  });
});
