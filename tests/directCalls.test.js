const http = require("http");
const request = require("supertest");
const { io: ioClient } = require("socket.io-client");
const app = require("../app");
const initSocket = require("../socket");
const callService = require("../services/callService");
const Membership = require("../models/Membership");
const DriverProfile = require("../models/DriverProfile");
const Chat = require("../models/Chat");
const Message = require("../models/Message");
const Order = require("../models/Order");
const { connectTestDb, disconnectTestDb } = require("./db");
const { setupPilotCity, createOrder } = require("./orderSetup");
const { registerUser } = require("./helpers");

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
  httpServer.closeAllConnections?.();
  await new Promise((resolve) => httpServer.close(resolve));
  await new Promise((resolve) => setTimeout(resolve, 300));
  await disconnectTestDb();
}, 15000);

// Clear in-memory calls and inCall flags so timers never leak between tests
afterEach(async () => {
  for (const [callId, call] of callService.activeCalls) {
    if (call.timer) clearTimeout(call.timer);
    callService.activeCalls.delete(callId);
  }
  await DriverProfile.updateMany({}, { inCall: false });
});

const setDriverOnline = async (userId, overrides = {}) => {
  const membership = await Membership.findOne({ userId, role: "driver" });
  await DriverProfile.findOneAndUpdate(
    { membershipId: membership._id },
    { shift: "online", lastSeen: new Date(), acceptDirectCalls: true, inCall: false, ...overrides }
  );
};

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

const connectClient = async (cookie) => {
  const client = ioClient(`http://localhost:${port}`, {
    transports: ["websocket"],
    extraHeaders: { cookie: Array.isArray(cookie) ? cookie.join("; ") : cookie },
  });
  await new Promise((resolve, reject) => {
    client.on("connect", resolve);
    client.on("connect_error", reject);
  });
  client.emit("user:online");
  await new Promise((resolve) => setTimeout(resolve, 300));
  return client;
};

const base64Cursor = (n) => Buffer.from(String(n), "utf8").toString("base64");

describe("Free drivers list", () => {
  let world;

  beforeEach(async () => {
    world = await setupPilotCity(app);
    for (const driver of world.drivers) {
      await setDriverOnline(driver.user._id);
    }
  });

  const list = (query = "") =>
    request(app)
      .get(`/api/cities/${world.city._id}/free-drivers${query}`)
      .set("Cookie", world.passenger.cookie);

  it("lists only online drivers accepting direct calls, without phone numbers", async () => {
    const res = await list();
    expect(res.status).toBe(200);
    expect(res.body.data.drivers).toHaveLength(3);
    for (const driver of res.body.data.drivers) {
      expect(driver.phone).toBeUndefined();
      expect(driver.carCaption).toBeTruthy();
    }
  });

  it("excludes offline, non-accepting, in-call and blocked drivers", async () => {
    await setDriverOnline(world.drivers[0].user._id, { shift: "offline" });
    await setDriverOnline(world.drivers[1].user._id, { acceptDirectCalls: false });
    await setDriverOnline(world.drivers[2].user._id, { inCall: true });

    const res = await list();
    expect(res.body.data.drivers).toHaveLength(0);
  });

  it("excludes drivers blocked by the passenger", async () => {
    await request(app)
      .post("/api/blocks")
      .set("Cookie", world.passenger.cookie)
      .send({ userId: world.drivers[0].user._id });

    const res = await list();
    const ids = res.body.data.drivers.map((driver) => String(driver.driverId));
    expect(ids).not.toContain(String(world.drivers[0].user._id));
    expect(ids).toHaveLength(2);
  });

  it("sorts favorites first and supports zone filter and cursor pagination", async () => {
    await request(app)
      .post("/api/favorites")
      .set("Cookie", world.passenger.cookie)
      .send({ driverId: world.drivers[2].user._id });

    const favorites = await list();
    expect(String(favorites.body.data.drivers[0].driverId)).toBe(
      String(world.drivers[2].user._id)
    );
    expect(favorites.body.data.drivers[0].isFavorite).toBe(true);

    const zone = await Membership.findOne({ userId: world.drivers[0].user._id });
    const zoned = await list(`?zoneId=${zone.zones[0]}`);
    // Favorites still outrank the zone match; drivers[0] must be flagged
    const zonedEntry = zoned.body.data.drivers.find(
      (driver) => String(driver.driverId) === String(world.drivers[0].user._id)
    );
    expect(zonedEntry).toBeDefined();
    expect(zonedEntry.matchesZone).toBe(true);

    const paged = await list(`?cursor=${base64Cursor(2)}`);
    expect(paged.body.data.drivers).toHaveLength(1);
    expect(paged.body.data.nextCursor).toBeNull();
  });
});

describe("Direct call to a free driver", () => {
  let world;
  let order;

  beforeEach(async () => {
    world = await setupPilotCity(app);
    for (const driver of world.drivers) {
      await setDriverOnline(driver.user._id);
    }
    const created = await createOrder(app, world.passenger, world.city, world.zones);
    order = created.body.data.order;
  });

  it("creates a direct chat, marks the driver inCall and clears it on decline", async () => {
    const passengerClient = await connectClient(world.passenger.cookie);
    const driverClient = await connectClient(world.drivers[0].cookie);

    // Register listeners before emitting so nothing is missed
    const invitePromise = waitFor(driverClient, "call:invite");
    const endedPromise = waitFor(passengerClient, "call:end");

    const ack = await passengerClient
      .timeout(3000)
      .emitWithAck("call:invite", {
        kind: "direct",
        target: String(world.drivers[0].user._id),
        cityId: String(world.city._id),
        signalData: { type: "offer", sdp: "direct-offer" },
      });
    expect(ack.callId).toBeTruthy();
    expect(ack.chatId).toBeTruthy();

    const invite = await invitePromise;
    expect(invite.kind).toBe("direct");
    expect(String(invite.from)).toBe(String(world.passenger.user._id));

    const profile = await DriverProfile.findOne({ userId: world.drivers[0].user._id });
    expect(profile.inCall).toBe(true);

    const chat = await Chat.findById(ack.chatId);
    expect(chat.type).toBe("direct");
    expect(chat.members.map(String).sort()).toEqual(
      [String(world.passenger.user._id), String(world.drivers[0].user._id)].sort()
    );

    driverClient.emit("call:end", { callId: ack.callId, reason: "decline" });
    const ended = await endedPromise;
    expect(ended.result).toBe("declined");

    const profileAfter = await DriverProfile.findOne({ userId: world.drivers[0].user._id });
    expect(profileAfter.inCall).toBe(false);

    const declineMessage = await Message.findOne({
      chatId: ack.chatId,
      body: "Звонок отклонён",
    });
    expect(declineMessage).toBeTruthy();

    passengerClient.close();
    driverClient.close();
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  it("returns busy for a driver already in a call", async () => {
    const passengerClient = await connectClient(world.passenger.cookie);
    const driverClient = await connectClient(world.drivers[0].cookie);

    const invitePromise = waitFor(driverClient, "call:invite");
    const firstAck = await passengerClient
      .timeout(3000)
      .emitWithAck("call:invite", {
        kind: "direct",
        target: String(world.drivers[0].user._id),
        cityId: String(world.city._id),
        signalData: { type: "offer" },
      });
    expect(firstAck.callId).toBeTruthy();
    await invitePromise;

    const otherPassenger = await registerUser(app);
    await request(app)
      .post("/api/memberships")
      .set("Cookie", otherPassenger.cookie)
      .send({ cityId: world.city._id, role: "passenger" });

    const otherClient = await connectClient(otherPassenger.cookie);
    // call:busy goes to the caller whose invite failed
    const busyPromise = waitFor(otherClient, "call:busy");
    const secondAck = await otherClient
      .timeout(3000)
      .emitWithAck("call:invite", {
        kind: "direct",
        target: String(world.drivers[0].user._id),
        cityId: String(world.city._id),
        signalData: { type: "offer" },
      });
    expect(secondAck.error).toContain("разговаривает");

    const busy = await busyPromise;
    expect(busy.error).toContain("разговаривает");

    passengerClient.close();
    driverClient.close();
    otherClient.close();
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  it("places a direct order through the call chat; only the target driver can accept", async () => {
    const passengerClient = await connectClient(world.passenger.cookie);
    const driverClient = await connectClient(world.drivers[0].cookie);

    const ack = await passengerClient
      .timeout(3000)
      .emitWithAck("call:invite", {
        kind: "direct",
        target: String(world.drivers[0].user._id),
        cityId: String(world.city._id),
        signalData: { type: "offer" },
      });

    // The driver sends an offer card in the direct chat
    const offerRes = await request(app)
      .post(`/api/chats/${ack.chatId}/offers`)
      .set("Cookie", world.drivers[0].cookie)
      .send({ priceText: "400 руб", etaMin: 7 });
    expect(offerRes.status).toBe(201);
    expect(offerRes.body.data.message.kind).toBe("offer");

    const orderRes = await request(app)
      .post("/api/orders")
      .set("Cookie", world.passenger.cookie)
      .send({
        cityId: world.city._id,
        fromZoneId: world.zones[0]._id,
        fromText: "Аэропорт",
        toText: "Центр",
        exactFrom: "Аэропорт, выход 4",
        exactTo: "ул. Ленина, 15",
        pax: 1,
        targetDriverId: String(world.drivers[0].user._id),
        chatId: ack.chatId,
      });
    expect(orderRes.status).toBe(201);
    const directOrder = orderRes.body.data.order;
    expect(directOrder.mode).toBe("direct");

    // The direct chat became the order chat with both members
    const chat = await Chat.findById(ack.chatId);
    expect(chat.type).toBe("order");
    expect(String(chat.orderId)).toBe(String(directOrder._id));
    expect(chat.members).toHaveLength(2);

    // Another driver cannot accept
    const foreign = await request(app)
      .post(`/api/orders/${directOrder._id}/accept`)
      .set("Cookie", world.drivers[1].cookie)
      .send({});
    expect(foreign.status).toBe(403);

    // The target driver sees the card without exact addresses
    const card = await request(app)
      .get(`/api/orders/${directOrder._id}`)
      .set("Cookie", world.drivers[0].cookie);
    expect(card.body.data.order.isTarget).toBe(true);
    expect(card.body.data.order.exactFrom).toBeUndefined();

    const accepted = await request(app)
      .post(`/api/orders/${directOrder._id}/accept`)
      .set("Cookie", world.drivers[0].cookie)
      .send({});
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.order.status).toBe("ASSIGNED");
    expect(accepted.body.data.order.exactFrom).toBe("Аэропорт, выход 4");

    // The passenger gets the driver's phone after ASSIGNED
    const passengerView = await request(app)
      .get(`/api/orders/${directOrder._id}`)
      .set("Cookie", world.passenger.cookie);
    expect(passengerView.body.data.order.driver.phone).toBe("+79000000010");

    passengerClient.close();
    driverClient.close();
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  it("driver decline and passenger republish create a broadcast order", async () => {
    const passengerClient = await connectClient(world.passenger.cookie);

    const orderRes = await request(app)
      .post("/api/orders")
      .set("Cookie", world.passenger.cookie)
      .send({
        cityId: world.city._id,
        fromZoneId: world.zones[0]._id,
        fromText: "Вокзал",
        toText: "Отель",
        targetDriverId: String(world.drivers[0].user._id),
      });
    expect(orderRes.status).toBe(201);
    const directOrder = orderRes.body.data.order;

    // Another driver cannot decline someone else's direct order
    const foreignDecline = await request(app)
      .post(`/api/orders/${directOrder._id}/decline`)
      .set("Cookie", world.drivers[1].cookie)
      .send({});
    expect(foreignDecline.status).toBe(403);

    const declined = await request(app)
      .post(`/api/orders/${directOrder._id}/decline`)
      .set("Cookie", world.drivers[0].cookie)
      .send({});
    expect(declined.status).toBe(200);
    expect(declined.body.data.order.status).toBe("CANCELLED");

    const suggestions = await Message.find({
      chatId: directOrder.chatId,
      body: "Вы можете опубликовать заказ для всех водителей города",
    });
    expect(suggestions).toHaveLength(1);

    const republished = await request(app)
      .post(`/api/orders/${directOrder._id}/republish`)
      .set("Cookie", world.passenger.cookie);
    expect(republished.status).toBe(201);
    expect(republished.body.data.order.mode).toBe("broadcast");
    expect(republished.body.data.order.status).toBe("PUBLISHED");
    expect(String(republished.body.data.order.chatId)).not.toBe(
      String(directOrder.chatId)
    );

    // The broadcast card reaches the driver feed of the zone
    const feed = await request(app)
      .get(`/api/orders?cityId=${world.city._id}&status=PUBLISHED`)
      .set("Cookie", world.drivers[0].cookie);
    expect(
      feed.body.data.orders.some((item) => item._id === republished.body.data.order._id)
    ).toBe(true);

    passengerClient.close();
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  it("accept and decline race produces exactly one final state", async () => {
    const orderRes = await request(app)
      .post("/api/orders")
      .set("Cookie", world.passenger.cookie)
      .send({
        cityId: world.city._id,
        fromZoneId: world.zones[0]._id,
        fromText: "Точка А",
        toText: "Точка Б",
        targetDriverId: String(world.drivers[0].user._id),
      });
    const directOrder = orderRes.body.data.order;

    const [accept, decline] = await Promise.all([
      request(app)
        .post(`/api/orders/${directOrder._id}/accept`)
        .set("Cookie", world.drivers[0].cookie)
        .send({}),
      request(app)
        .post(`/api/orders/${directOrder._id}/decline`)
        .set("Cookie", world.drivers[0].cookie)
        .send({}),
    ]);

    const okResults = [accept, decline].filter((res) => res.status === 200);
    expect(okResults).toHaveLength(1);

    const finalOrder = await Order.findById(directOrder._id);
    expect(["ASSIGNED", "CANCELLED"]).toContain(finalOrder.status);
  });

  it("dialog appears in my chats with text and media support", async () => {
    const passengerClient = await connectClient(world.passenger.cookie);
    const driverClient = await connectClient(world.drivers[0].cookie);

    const invitePromise = waitFor(driverClient, "call:invite");
    const endedPromise = waitFor(passengerClient, "call:end");

    const ack = await passengerClient
      .timeout(3000)
      .emitWithAck("call:invite", {
        kind: "direct",
        target: String(world.drivers[0].user._id),
        cityId: String(world.city._id),
        signalData: { type: "offer" },
      });

    await invitePromise;
    driverClient.emit("call:end", { callId: ack.callId, reason: "decline" });
    await endedPromise;

    // The passenger sees the dialog with the driver, without the phone
    const mine = await request(app)
      .get("/api/chats/my")
      .set("Cookie", world.passenger.cookie);
    expect(mine.status).toBe(200);
    const dialog = mine.body.data.chats.find(
      (chat) => String(chat._id) === String(ack.chatId)
    );
    expect(dialog).toBeTruthy();
    expect(dialog.peer.name).toBe(world.drivers[0].user.name);
    expect(dialog.carCaption).toBeTruthy();
    expect(dialog.lastMessage.body).toBe("Звонок отклонён");

    // Text and media messages work in the direct chat
    const text = await request(app)
      .post(`/api/chats/${ack.chatId}/messages`)
      .set("Cookie", world.passenger.cookie)
      .send({ body: "Здравствуйте, вы свободны?" });
    expect(text.status).toBe(201);

    const photo = await request(app)
      .post(`/api/chats/${ack.chatId}/messages`)
      .set("Cookie", world.passenger.cookie)
      .send({ kind: "photo", imageUrl: "https://res.cloudinary.com/test/p.jpg" });
    expect(photo.status).toBe(201);

    const history = await request(app)
      .get(`/api/chats/${ack.chatId}/messages`)
      .set("Cookie", world.drivers[0].cookie);
    const kinds = history.body.data.messages.map((message) => message.kind);
    expect(kinds).toContain("text");
    expect(kinds).toContain("photo");

    // Unread count for the driver, cleared after marking read
    const mineBefore = await request(app)
      .get("/api/chats/my")
      .set("Cookie", world.drivers[0].cookie);
    const dialogBefore = mineBefore.body.data.chats.find(
      (chat) => String(chat._id) === String(ack.chatId)
    );
    expect(dialogBefore.unreadCount).toBe(2);

    await request(app)
      .post(`/api/chats/${ack.chatId}/read`)
      .set("Cookie", world.drivers[0].cookie)
      .send({});

    const mineAfter = await request(app)
      .get("/api/chats/my")
      .set("Cookie", world.drivers[0].cookie);
    const dialogAfter = mineAfter.body.data.chats.find(
      (chat) => String(chat._id) === String(ack.chatId)
    );
    expect(dialogAfter.unreadCount).toBe(0);

    passengerClient.close();
    driverClient.close();
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  it("prevents a second active order in the same dialog", async () => {
    const orderRes = await request(app)
      .post("/api/orders")
      .set("Cookie", world.passenger.cookie)
      .send({
        cityId: world.city._id,
        fromZoneId: world.zones[0]._id,
        fromText: "Точка А",
        toText: "Точка Б",
        targetDriverId: String(world.drivers[0].user._id),
      });
    const directOrder = orderRes.body.data.order;

    // The direct chat became an order chat with an active order
    const second = await request(app)
      .post("/api/orders")
      .set("Cookie", world.passenger.cookie)
      .send({
        cityId: world.city._id,
        fromZoneId: world.zones[0]._id,
        fromText: "Другая точка",
        toText: "Другой конец",
        targetDriverId: String(world.drivers[0].user._id),
        chatId: directOrder.chatId,
      });
    expect(second.status).toBe(409);
    expect(second.body.message).toContain("уже есть активный заказ");

    // After cancellation the dialog can be reused
    await request(app)
      .post(`/api/orders/${directOrder._id}/cancel`)
      .set("Cookie", world.passenger.cookie)
      .send({ reason: "Передумал" });

    const third = await request(app)
      .post("/api/orders")
      .set("Cookie", world.passenger.cookie)
      .send({
        cityId: world.city._id,
        fromZoneId: world.zones[0]._id,
        fromText: "Точка А",
        toText: "Точка Б",
        targetDriverId: String(world.drivers[0].user._id),
        chatId: directOrder.chatId,
      });
    expect(third.status).toBe(201);
    expect(String(third.body.data.order.chatId)).toBe(String(directOrder.chatId));
  });

  it("scheduled direct orders can be accepted by an offline driver", async () => {
    await setDriverOnline(world.drivers[0].user._id, { shift: "offline" });

    const orderRes = await request(app)
      .post("/api/orders")
      .set("Cookie", world.passenger.cookie)
      .send({
        cityId: world.city._id,
        fromZoneId: world.zones[0]._id,
        fromText: "Дом",
        toText: "Аэропорт",
        whenType: "scheduled",
        whenAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        targetDriverId: String(world.drivers[0].user._id),
      });
    expect(orderRes.status).toBe(201);

    const accepted = await request(app)
      .post(`/api/orders/${orderRes.body.data.order._id}/accept`)
      .set("Cookie", world.drivers[0].cookie)
      .send({});
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.order.status).toBe("ASSIGNED");
  });

  it("enforces per-hour call limits from city settings", async () => {
    await request(app).patch(`/api/admin/limits-not-used`, {});
    // Set tight limits via direct model update
    const City = require("../models/City");
    await City.findByIdAndUpdate(world.city._id, {
      "settings.directCallLimits.maxUnansweredPerDriver": 1,
    });

    const passengerClient = await connectClient(world.passenger.cookie);
    const driverClient = await connectClient(world.drivers[0].cookie);

    const invitePromise = waitFor(driverClient, "call:invite");
    const ack = await passengerClient
      .timeout(3000)
      .emitWithAck("call:invite", {
        kind: "direct",
        target: String(world.drivers[0].user._id),
        cityId: String(world.city._id),
        signalData: { type: "offer" },
      });
    await invitePromise;

    driverClient.emit("call:end", { callId: ack.callId, reason: "decline" });
    await waitFor(passengerClient, "call:end");

    const secondAck = await passengerClient
      .timeout(3000)
      .emitWithAck("call:invite", {
        kind: "direct",
        target: String(world.drivers[0].user._id),
        cityId: String(world.city._id),
        signalData: { type: "offer" },
      });
    expect(secondAck.error).toContain("неотвеченных вызовов");

    passengerClient.close();
    driverClient.close();
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
});
