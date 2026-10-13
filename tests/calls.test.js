const http = require("http");
const request = require("supertest");
const { io: ioClient } = require("socket.io-client");
const app = require("../app");
const initSocket = require("../socket");
const CallLog = require("../models/CallLog");
const Message = require("../models/Message");
const Order = require("../models/Order");
const callService = require("../services/callService");
const { connectTestDb, disconnectTestDb } = require("./db");
const { setupPilotCity, createOrder } = require("./orderSetup");

let httpServer;
let ioInstance;
let port;

beforeAll(async () => {
  await connectTestDb();
  httpServer = http.createServer(app);
  ioInstance = initSocket(httpServer);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  port = httpServer.address().port;
}, 15000);

afterAll(async () => {
  if (ioInstance) ioInstance.close();
  await new Promise((resolve) => httpServer.close(resolve));
  // Allow socket disconnect handlers to settle before dropping the database
  await new Promise((resolve) => setTimeout(resolve, 300));
  await disconnectTestDb();
}, 15000);

const waitFor = (client, event, timeoutMs = 3000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for ${event}`)),
      timeoutMs
    );
    client.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const connectClient = async (userId) => {
  const client = ioClient(`http://localhost:${port}`, {
    transports: ["websocket"],
  });
  await new Promise((resolve, reject) => {
    client.on("connect", resolve);
    client.on("connect_error", reject);
  });
  client.emit("user:online", String(userId));
  await new Promise((resolve) => setTimeout(resolve, 300));
  return client;
};

describe("Voice calls between order participants", () => {
  let world;
  let order;

  beforeEach(async () => {
    world = await setupPilotCity(app);
    const created = await createOrder(app, world.passenger, world.city, world.zones, {
      matchMode: "first_take",
    });
    order = created.body.data.order;
    await request(app)
      .post(`/api/orders/${order._id}/accept`)
      .set("Cookie", world.drivers[0].cookie)
      .send({});
  });

  it("ICE credentials: participant allowed, outsider rejected", async () => {
    const ok = await request(app)
      .get(`/api/calls/ice?orderId=${order._id}`)
      .set("Cookie", world.passenger.cookie);
    expect(ok.status).toBe(200);
    expect(Array.isArray(ok.body.data.iceServers)).toBe(true);
    // Without TURN configured the client is told not to force relay
    expect(ok.body.data.iceTransportPolicy).toBe("all");

    const outsider = await require("./helpers").registerUser(app);
    const denied = await request(app)
      .get(`/api/calls/ice?orderId=${order._id}`)
      .set("Cookie", outsider.cookie);
    expect(denied.status).toBe(403);
  });

  it("full call signaling between passenger and driver with logs", async () => {
    const passengerClient = await connectClient(world.passenger.user._id);
    const driverClient = await connectClient(world.drivers[0].user._id);

    // Register listeners before emitting so nothing is missed
    const invitePromise = waitFor(driverClient, "call:invite");
    const ack = await passengerClient
      .timeout(3000)
      .emitWithAck("call:invite", {
        orderId: order._id,
        target: String(world.drivers[0].user._id),
        signalData: { type: "offer", sdp: "fake-offer" },
      });
    expect(ack.callId).toBeTruthy();

    const invite = await invitePromise;
    expect(String(invite.from)).toBe(String(world.passenger.user._id));
    expect(invite.signalData.sdp).toBe("fake-offer");

    const answerPromise = waitFor(passengerClient, "call:answer");
    const icePromise = waitFor(passengerClient, "call:ice");
    const endedPromise = waitFor(passengerClient, "call:end");

    driverClient.emit("call:answer", {
      callId: invite.callId,
      signalData: { type: "answer", sdp: "fake-answer" },
    });
    const answer = await answerPromise;
    expect(answer.signalData.sdp).toBe("fake-answer");

    driverClient.emit("call:ice", {
      callId: invite.callId,
      candidate: { candidate: "ice-candidate-1" },
    });
    const ice = await icePromise;
    expect(ice.candidate.candidate).toBe("ice-candidate-1");

    driverClient.emit("call:end", { callId: invite.callId, reason: "hangup" });
    const ended = await endedPromise;
    expect(ended.result).toBe("answered");

    const log = await CallLog.findById(invite.callId);
    expect(log.result).toBe("answered");
    expect(log.durationSec).toBeGreaterThanOrEqual(0);

    const message = await Message.findOne({
      chatId: order.chatId,
      body: /^Звонок \d+:\d{2}$/,
    });
    expect(message).toBeTruthy();

    passengerClient.close();
    driverClient.close();
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  it("outsider cannot signal into someone else's order", async () => {
    const outsider = await require("./helpers").registerUser(app);
    const outsiderClient = await connectClient(outsider.user._id);

    const ack = await outsiderClient
      .timeout(3000)
      .emitWithAck("call:invite", {
        orderId: order._id,
        target: String(world.drivers[0].user._id),
        signalData: { type: "offer" },
      });
    expect(ack.error).toBeTruthy();
    expect(ack.callId).toBeUndefined();

    outsiderClient.close();
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  it("calls are rejected before the driver is assigned", async () => {
    const second = await createOrder(app, world.passenger, world.city, world.zones);
    const publishedOrder = await Order.findById(second.body.data.order._id);

    await expect(callService.assertCallsAllowed(publishedOrder)).rejects.toThrow(
      "назначения"
    );

    // A call attempt for the published order fails for a non-participant too
    const passengerClient = await connectClient(world.passenger.user._id);
    const ack = await passengerClient
      .timeout(3000)
      .emitWithAck("call:invite", {
        orderId: second.body.data.order._id,
        target: String(world.drivers[0].user._id),
        signalData: { type: "offer" },
      });
    expect(ack.error).toBeTruthy();

    passengerClient.close();
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  it("declined call is logged and posted to the chat", async () => {
    const passengerClient = await connectClient(world.passenger.user._id);
    const driverClient = await connectClient(world.drivers[0].user._id);

    const invitePromise = waitFor(driverClient, "call:invite");
    const endedPromise = waitFor(passengerClient, "call:end");

    const ack = await passengerClient
      .timeout(3000)
      .emitWithAck("call:invite", {
        orderId: order._id,
        target: String(world.drivers[0].user._id),
        signalData: { type: "offer" },
      });

    await invitePromise;
    driverClient.emit("call:end", { callId: ack.callId, reason: "decline" });

    const ended = await endedPromise;
    expect(ended.result).toBe("declined");

    const log = await CallLog.findById(ack.callId);
    expect(log.result).toBe("declined");

    const message = await Message.findOne({
      chatId: order.chatId,
      body: "Звонок отклонён",
    });
    expect(message).toBeTruthy();

    passengerClient.close();
    driverClient.close();
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  it("call history endpoint lists logs for participants", async () => {
    await CallLog.create({
      orderId: order._id,
      chatId: order.chatId,
      callerId: world.passenger.user._id,
      calleeId: world.drivers[0].user._id,
      result: "missed",
      startedAt: new Date(),
      endedAt: new Date(),
    });

    const res = await request(app)
      .get(`/api/orders/${order._id}/calls`)
      .set("Cookie", world.passenger.cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.calls).toHaveLength(1);
    expect(res.body.data.calls[0].result).toBe("missed");
  });

  it("five unanswered calls in a row pause the caller for 2 minutes", async () => {
    const now = Date.now();
    for (let i = 0; i < 5; i += 1) {
      await CallLog.create({
        orderId: order._id,
        chatId: order.chatId,
        callerId: world.passenger.user._id,
        calleeId: world.drivers[0].user._id,
        result: "missed",
        startedAt: new Date(now - i * 10000),
        endedAt: new Date(now - i * 10000),
      });
    }

    const passengerClient = await connectClient(world.passenger.user._id);
    const ack = await passengerClient
      .timeout(3000)
      .emitWithAck("call:invite", {
        orderId: order._id,
        target: String(world.drivers[0].user._id),
        signalData: { type: "offer" },
      });
    expect(ack.error).toContain("неотвеченных звонков");

    passengerClient.close();
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  it("answered calls reset the unanswered streak", async () => {
    const now = Date.now();
    for (let i = 0; i < 5; i += 1) {
      await CallLog.create({
        orderId: order._id,
        chatId: order.chatId,
        callerId: world.passenger.user._id,
        calleeId: world.drivers[0].user._id,
        result: i < 4 ? "missed" : "answered",
        startedAt: new Date(now - i * 10000),
        endedAt: new Date(now - i * 10000),
      });
    }

    const passengerClient = await connectClient(world.passenger.user._id);
    const driverClient = await connectClient(world.drivers[0].user._id);

    const ack = await passengerClient
      .timeout(3000)
      .emitWithAck("call:invite", {
        orderId: order._id,
        target: String(world.drivers[0].user._id),
        signalData: { type: "offer" },
      });
    expect(ack.callId).toBeTruthy();

    passengerClient.close();
    driverClient.close();
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
});
