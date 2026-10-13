const request = require("supertest");
const app = require("../app");
const Message = require("../models/Message");
const City = require("../models/City");
const { connectTestDb, disconnectTestDb } = require("./db");
const { setupPilotCity, createOrder } = require("./orderSetup");

beforeAll(async () => {
  await connectTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe("Bot dispatcher: order card and action buttons", () => {
  let world;

  beforeEach(async () => {
    world = await setupPilotCity(app);
  });

  const createFirstTakeOrder = async () => {
    const created = await createOrder(app, world.passenger, world.city, world.zones, {
      matchMode: "first_take",
    });
    return created.body.data.order;
  };

  it("pins an order_card on publish and updates it on assignment", async () => {
    const order = await createFirstTakeOrder();

    const cardAfterPublish = await Message.findOne({
      chatId: order.chatId,
      kind: "order_card",
    });
    expect(cardAfterPublish).toBeTruthy();
    expect(cardAfterPublish.meta.status).toBe("PUBLISHED");
    expect(cardAfterPublish.meta.from).toBe("От ЖД вокзала");
    expect(cardAfterPublish.meta.pax).toBe(2);

    const cardId = cardAfterPublish._id;

    await request(app)
      .post(`/api/orders/${order._id}/accept`)
      .set("Cookie", world.drivers[0].cookie)
      .send({});

    const cardAfterAssign = await Message.findById(cardId);
    expect(cardAfterAssign.meta.status).toBe("ASSIGNED");
    expect(String(cardAfterAssign.meta.driverId)).toBe(String(world.drivers[0].user._id));

    // Exactly one card stays pinned
    const cards = await Message.countDocuments({ chatId: order.chatId, kind: "order_card" });
    expect(cards).toBe(1);
  });

  it("posts quick action buttons per status", async () => {
    const order = await createFirstTakeOrder();
    await request(app)
      .post(`/api/orders/${order._id}/accept`)
      .set("Cookie", world.drivers[0].cookie)
      .send({});

    const actionMessages = await Message.find({
      chatId: order.chatId,
      kind: "action",
    });
    const buttons = actionMessages.flatMap((message) => message.meta.buttons);

    const arrive = buttons.find((button) => button.action === "arrive");
    expect(arrive).toBeTruthy();
    expect(arrive.roles).toContain("driver");

    const cancel = buttons.find((button) => button.action === "cancel");
    expect(cancel).toBeTruthy();
    expect(cancel.roles).toContain("passenger");
  });

  it("message history includes system, action and card kinds", async () => {
    const order = await createFirstTakeOrder();
    await request(app)
      .post(`/api/orders/${order._id}/accept`)
      .set("Cookie", world.drivers[0].cookie)
      .send({});

    const history = await request(app)
      .get(`/api/orders/${order._id}/messages`)
      .set("Cookie", world.passenger.cookie);

    const kinds = history.body.data.messages.map((message) => message.kind);
    expect(kinds).toContain("system");
    expect(kinds).toContain("action");
    expect(kinds).toContain("order_card");
  });
});

describe("Contact filter", () => {
  let world;

  beforeEach(async () => {
    world = await setupPilotCity(app);
    await City.findByIdAndUpdate(world.city._id, {
      "settings.filterContacts": true,
    });
  });

  const createSimpleOrder = async () => {
    const created = await createOrder(app, world.passenger, world.city, world.zones);
    return created.body.data.order;
  };

  it("blocks phone numbers when the city enables the filter", async () => {
    const order = await createSimpleOrder();

    const res = await request(app)
      .post(`/api/orders/${order._id}/messages`)
      .set("Cookie", world.passenger.cookie)
      .send({ body: "Звоните мне +7 900 123-45-67 после 18:00" });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("запрещена");
  });

  it("blocks links when the city enables the filter", async () => {
    const order = await createSimpleOrder();

    const res = await request(app)
      .post(`/api/orders/${order._id}/messages`)
      .set("Cookie", world.passenger.cookie)
      .send({ body: "Схема here: https://example.ru/map" });

    expect(res.status).toBe(400);
  });

  it("allows normal text", async () => {
    const order = await createSimpleOrder();

    const res = await request(app)
      .post(`/api/orders/${order._id}/messages`)
      .set("Cookie", world.passenger.cookie)
      .send({ body: "Жду у главного входа, пожалуйста, подъезжайте" });

    expect(res.status).toBe(201);
  });

  it("does not filter when the city has not enabled it", async () => {
    await City.findByIdAndUpdate(world.city._id, {
      "settings.filterContacts": false,
    });
    const order = await createSimpleOrder();

    const res = await request(app)
      .post(`/api/orders/${order._id}/messages`)
      .set("Cookie", world.passenger.cookie)
      .send({ body: "Мой номер 89001234567" });

    expect(res.status).toBe(201);
  });
});
