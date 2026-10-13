const request = require("supertest");
const app = require("../app");
const Chat = require("../models/Chat");
const Message = require("../models/Message");
const Order = require("../models/Order");
const DriverProfile = require("../models/DriverProfile");
const { connectTestDb, disconnectTestDb } = require("./db");
const { setupPilotCity, createOrder } = require("./orderSetup");
const { registerUser } = require("./helpers");

beforeAll(async () => {
  await connectTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe("Orders and the state machine", () => {
  let world;

  beforeEach(async () => {
    world = await setupPilotCity(app);
  });

  const createBroadcastOrder = async (overrides = {}) =>
    createOrder(app, world.passenger, world.city, world.zones, overrides);

  it("passenger publishes an order: PUBLISHED, chat created, exact addresses visible to him", async () => {
    const res = await createBroadcastOrder();

    expect(res.status).toBe(201);
    const order = res.body.data.order;
    expect(order.status).toBe("PUBLISHED");
    expect(order.exactFrom).toBe("ул. Привокзальная, 1");
    expect(order.chatId).toBeTruthy();
    expect(order.statusLog.map((entry) => entry.status)).toContain("PUBLISHED");

    const chat = await Chat.findById(order.chatId);
    expect(chat.type).toBe("order");
    const systemMessage = await Message.findOne({ chatId: order.chatId, kind: "system" });
    expect(systemMessage.body).toBe("Заказ опубликован");
  });

  it("driver sees the card without exact addresses and without the passenger name", async () => {
    const created = await createBroadcastOrder();
    const orderId = created.body.data.order._id;

    const listRes = await request(app)
      .get(`/api/orders?cityId=${world.city._id}&status=PUBLISHED`)
      .set("Cookie", world.drivers[0].cookie);
    expect(listRes.status).toBe(200);
    const card = listRes.body.data.orders.find((order) => order._id === orderId);
    expect(card).toBeDefined();
    expect(card.exactFrom).toBeUndefined();
    expect(card.exactTo).toBeUndefined();
    expect(card.passengerId).toBeUndefined();

    const getRes = await request(app)
      .get(`/api/orders/${orderId}`)
      .set("Cookie", world.drivers[0].cookie);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.order.exactFrom).toBeUndefined();
    expect(getRes.body.data.order.passengerId).toBeUndefined();
  });

  it("scheduled broadcast orders do not fan out until preorder activation", async () => {
    const created = await createOrder(app, world.passenger, world.city, world.zones, {
      whenType: "scheduled",
      whenAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    });
    const scheduledOrder = created.body.data.order;
    expect(scheduledOrder.status).toBe("DRAFT");

    // The card is not in the drivers' feeds yet
    const feed = await request(app)
      .get(`/api/orders?cityId=${world.city._id}&status=PUBLISHED`)
      .set("Cookie", world.drivers[0].cookie);
    expect(
      feed.body.data.orders.some((order) => order._id === scheduledOrder._id)
    ).toBe(false);

    // The passenger sees his draft and can cancel it without penalty
    const mine = await request(app)
      .get(`/api/orders?cityId=${world.city._id}`)
      .set("Cookie", world.passenger.cookie);
    const own = mine.body.data.orders.find(
      (order) => order._id === scheduledOrder._id
    );
    expect(own).toBeDefined();
    expect(own.status).toBe("DRAFT");

    const cancelled = await request(app)
      .post(`/api/orders/${scheduledOrder._id}/cancel`)
      .set("Cookie", world.passenger.cookie)
      .send({ reason: "Планы изменились" });
    expect(cancelled.status).toBe(200);

    // "Now" orders still fan out immediately
    const nowOrder = await createBroadcastOrder();
    const feedAfter = await request(app)
      .get(`/api/orders?cityId=${world.city._id}&status=PUBLISHED`)
      .set("Cookie", world.drivers[0].cookie);
    expect(
      feedAfter.body.data.orders.some((order) => order._id === nowOrder.body.data.order._id)
    ).toBe(true);
  });

  it("unread message counts appear in lists and clear after marking read", async () => {
    const created = await createBroadcastOrder({ matchMode: "first_take" });
    const orderId = created.body.data.order._id;
    await request(app)
      .post(`/api/orders/${orderId}/accept`)
      .set("Cookie", world.drivers[0].cookie)
      .send({});

    // Driver sends two messages to the passenger
    for (const body of ["Подъезжаю", "У входа"]) {
      await request(app)
        .post(`/api/orders/${orderId}/messages`)
        .set("Cookie", world.drivers[0].cookie)
        .send({ body });
    }

    const listBefore = await request(app)
      .get(`/api/orders?cityId=${world.city._id}`)
      .set("Cookie", world.passenger.cookie);
    const card = listBefore.body.data.orders.find((order) => order._id === orderId);
    expect(card.unreadCount).toBe(2);

    const single = await request(app)
      .get(`/api/orders/${orderId}`)
      .set("Cookie", world.passenger.cookie);
    expect(single.body.data.order.unreadCount).toBe(2);

    // Passenger opens the chat: messages get marked read
    await request(app)
      .post(`/api/orders/${orderId}/read`)
      .set("Cookie", world.passenger.cookie)
      .send({});

    const listAfter = await request(app)
      .get(`/api/orders?cityId=${world.city._id}`)
      .set("Cookie", world.passenger.cookie);
    const cardAfter = listAfter.body.data.orders.find((order) => order._id === orderId);
    expect(cardAfter.unreadCount).toBe(0);

    // The outsider never gets counts
    const outsider = await registerUser(app);
    const denied = await request(app)
      .post(`/api/orders/${orderId}/read`)
      .set("Cookie", outsider.cookie)
      .send({});
    expect(denied.status).toBe(403);
  });

  it("outsider has no access to the order", async () => {
    const created = await createBroadcastOrder();
    const outsider = await registerUser(app);

    const res = await request(app)
      .get(`/api/orders/${created.body.data.order._id}`)
      .set("Cookie", outsider.cookie);
    expect(res.status).toBe(403);
  });

  it("first-take race gives exactly one winner", async () => {
    const created = await createBroadcastOrder({ matchMode: "first_take" });
    const orderId = created.body.data.order._id;

    const [first, second] = await Promise.all([
      request(app)
        .post(`/api/orders/${orderId}/accept`)
        .set("Cookie", world.drivers[0].cookie)
        .send({}),
      request(app)
        .post(`/api/orders/${orderId}/accept`)
        .set("Cookie", world.drivers[1].cookie)
        .send({}),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);

    const order = await Order.findById(orderId);
    expect(order.status).toBe("ASSIGNED");
    const winners = [first, second].filter((res) => res.status === 200);
    expect(String(order.driverId)).toBe(String(winners[0].body.data.order.driverId));
  });

  it("forbidden transitions are rejected", async () => {
    const created = await createBroadcastOrder({ matchMode: "first_take" });
    const orderId = created.body.data.order._id;

    const accepted = await request(app)
      .post(`/api/orders/${orderId}/accept`)
      .set("Cookie", world.drivers[0].cookie)
      .send({});
    expect(accepted.status).toBe(200);

    // Cannot start the ride before arriving and waiting
    const earlyStart = await request(app)
      .post(`/api/orders/${orderId}/action`)
      .set("Cookie", world.drivers[0].cookie)
      .send({ action: "start" });
    expect(earlyStart.status).toBe(409);

    // Only the assigned driver can act
    const wrongDriver = await request(app)
      .post(`/api/orders/${orderId}/action`)
      .set("Cookie", world.drivers[1].cookie)
      .send({ action: "arrive" });
    expect(wrongDriver.status).toBe(403);
  });

  it("offers flow: driver offers, passenger accepts, driver phone revealed", async () => {
    const created = await createBroadcastOrder();
    const orderId = created.body.data.order._id;

    const offerRes = await request(app)
      .post(`/api/orders/${orderId}/offers`)
      .set("Cookie", world.drivers[0].cookie)
      .send({ priceText: "350 руб", etaMin: 5 });
    expect(offerRes.status).toBe(201);

    const offersList = await request(app)
      .get(`/api/orders/${orderId}/offers`)
      .set("Cookie", world.passenger.cookie);
    expect(offersList.status).toBe(200);
    expect(offersList.body.data.offers).toHaveLength(1);
    expect(offersList.body.data.offers[0].carCaption).toBeTruthy();

    const accepted = await request(app)
      .post(`/api/orders/${orderId}/accept`)
      .set("Cookie", world.passenger.cookie)
      .send({ offerId: offersList.body.data.offers[0]._id });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.order.status).toBe("ASSIGNED");
    expect(accepted.body.data.order.priceAgreed).toBe("350 руб");
    expect(accepted.body.data.order.driver.phone).toBe("+79000000010");

    // The assigned driver sees exact addresses, passenger identity and name
    const driverView = await request(app)
      .get(`/api/orders/${orderId}`)
      .set("Cookie", world.drivers[0].cookie);
    expect(driverView.body.data.order.exactFrom).toBe("ул. Привокзальная, 1");
    expect(driverView.body.data.order.passengerId).toBeDefined();
    expect(driverView.body.data.order.passenger.name).toBe("Тестовый Пользователь");

    // The other drivers still do not
    const otherDriverView = await request(app)
      .get(`/api/orders/${orderId}`)
      .set("Cookie", world.drivers[1].cookie);
    expect(otherDriverView.body.data.order.exactFrom).toBeUndefined();
  });

  it("in offers mode a driver must send an offer instead of taking the order", async () => {
    const created = await createBroadcastOrder();
    const res = await request(app)
      .post(`/api/orders/${created.body.data.order._id}/accept`)
      .set("Cookie", world.drivers[0].cookie)
      .send({});
    expect(res.status).toBe(409);
  });

  it("full lifecycle: assign, arrive, wait, start, undo, start, finish", async () => {
    const created = await createBroadcastOrder({ matchMode: "first_take" });
    const orderId = created.body.data.order._id;
    const driverCookie = world.drivers[0].cookie;

    await request(app).post(`/api/orders/${orderId}/accept`).set("Cookie", driverCookie).send({});

    const act = (action, cookie = driverCookie) =>
      request(app)
        .post(`/api/orders/${orderId}/action`)
        .set("Cookie", cookie)
        .send({ action });

    expect((await act("arrive")).body.data.order.status).toBe("ARRIVING");
    expect((await act("wait")).body.data.order.status).toBe("WAITING");
    expect((await act("start")).body.data.order.status).toBe("IN_RIDE");
    expect((await act("undo_start")).body.data.order.status).toBe("WAITING");
    expect((await act("start")).body.data.order.status).toBe("IN_RIDE");
    const finished = await act("finish");
    expect(finished.body.data.order.status).toBe("COMPLETED");

    const systemBodies = (await Message.find({ chatId: created.body.data.order.chatId }).sort({ createdAt: 1 })).map(
      (message) => message.body
    );
    expect(systemBodies).toContain("Водитель выехал");
    expect(systemBodies).toContain("Водитель на месте");
    expect(systemBodies).toContain("Поездка началась");
    expect(systemBodies).toContain("Водитель отменил начало поездки");
    expect(systemBodies).toContain("Поездка завершена");

    // Driver returns online after finishing
    const profile = await DriverProfile.findOne({ userId: world.drivers[0].user._id });
    expect(profile.shift).toBe("online");
  });

  it("cancel requires a reason and records it", async () => {
    const created = await createBroadcastOrder();
    const orderId = created.body.data.order._id;

    const noReason = await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set("Cookie", world.passenger.cookie)
      .send({});
    expect(noReason.status).toBe(400);

    const cancelled = await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set("Cookie", world.passenger.cookie)
      .send({ reason: "Передумал" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.order.status).toBe("CANCELLED");

    const messages = await Message.find({ chatId: created.body.data.order.chatId });
    expect(messages.some((message) => message.body.includes("Передумал"))).toBe(true);
  });

  it("dispatcher assigns a driver manually and sees exact addresses", async () => {
    const created = await createBroadcastOrder();
    const orderId = created.body.data.order._id;

    const queue = await request(app)
      .get(`/api/orders?cityId=${world.city._id}`)
      .set("Cookie", world.dispatcher.cookie);
    expect(queue.status).toBe(200);
    const card = queue.body.data.orders.find((order) => order._id === orderId);
    expect(card.exactFrom).toBe("ул. Привокзальная, 1");

    const mine = await request(app)
      .get("/api/memberships/mine")
      .set("Cookie", world.drivers[0].cookie);
    const membershipId = mine.body.data.memberships[0]._id;

    const assigned = await request(app)
      .post(`/api/orders/${orderId}/assign`)
      .set("Cookie", world.dispatcher.cookie)
      .send({ membershipId });
    expect(assigned.status).toBe(200);
    expect(assigned.body.data.order.status).toBe("ASSIGNED");
    expect(assigned.body.data.order.driver.phone).toBeTruthy();
  });

  it("a driver of another city cannot see or offer on the order", async () => {
    const created = await createBroadcastOrder();
    const orderId = created.body.data.order._id;

    const outsiderDriver = await registerUser(app);
    const Zone = require("../models/Zone");
    const City = require("../models/City");
    const samara = await City.findOne({ name: "Самара" });
    const samaraZones = await Zone.find({ cityId: samara._id }).sort({ name: 1 });
    await request(app)
      .post("/api/memberships")
      .set("Cookie", outsiderDriver.cookie)
      .send({
        cityId: samara._id,
        role: "driver",
        displayName: "Самарский",
        phone: "+79009999999",
        car: { color: "Красный", plate: "999" },
        zones: [samaraZones[0]._id.toString()],
      });

    const view = await request(app)
      .get(`/api/orders/${orderId}`)
      .set("Cookie", outsiderDriver.cookie);
    expect(view.status).toBe(403);

    const offer = await request(app)
      .post(`/api/orders/${orderId}/offers`)
      .set("Cookie", outsiderDriver.cookie)
      .send({ priceText: "100", etaMin: 10 });
    expect(offer.status).toBe(403);
  });

  it("dispute adds dispatchers to the chat", async () => {
    const created = await createBroadcastOrder({ matchMode: "first_take" });
    const orderId = created.body.data.order._id;
    await request(app)
      .post(`/api/orders/${orderId}/accept`)
      .set("Cookie", world.drivers[0].cookie)
      .send({});

    const res = await request(app)
      .post(`/api/orders/${orderId}/dispute`)
      .set("Cookie", world.passenger.cookie)
      .send({ reason: "Водитель едет не туда" });
    expect(res.status).toBe(200);
    expect(res.body.data.order.status).toBe("DISPUTE");

    const chat = await Chat.findById(created.body.data.order.chatId);
    expect(chat.members.some((member) => String(member) === String(world.dispatcher.user._id))).toBe(true);
  });

  it("order chat supports text messages between participants", async () => {
    const created = await createBroadcastOrder({ matchMode: "first_take" });
    const orderId = created.body.data.order._id;
    await request(app)
      .post(`/api/orders/${orderId}/accept`)
      .set("Cookie", world.drivers[0].cookie)
      .send({});

    const sent = await request(app)
      .post(`/api/orders/${orderId}/messages`)
      .set("Cookie", world.passenger.cookie)
      .send({ body: "Жду у подъезда" });
    expect(sent.status).toBe(201);

    const history = await request(app)
      .get(`/api/orders/${orderId}/messages`)
      .set("Cookie", world.drivers[0].cookie);
    expect(history.status).toBe(200);
    const texts = history.body.data.messages.filter((message) => message.kind === "text");
    expect(texts.some((message) => message.body === "Жду у подъезда")).toBe(true);
  });
});
