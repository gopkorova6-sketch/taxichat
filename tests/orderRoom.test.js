const http = require("http");
const request = require("supertest");
const { io: ioClient } = require("socket.io-client");
const app = require("../app");
const initSocket = require("../socket");
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
  httpServer.closeAllConnections?.();
  await new Promise((resolve) => httpServer.close(resolve));
  await new Promise((resolve) => setTimeout(resolve, 300));
  await disconnectTestDb();
}, 15000);

const waitFor = (client, event, timeoutMs = 3000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
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

const joinRoom = (client, orderId) =>
  new Promise((resolve) => client.emit("order:join", { orderId }, resolve));

describe("Live order rooms", () => {
  let world;
  let order;
  const clients = [];

  beforeEach(async () => {
    world = await setupPilotCity(app);
    const created = await createOrder(app, world.passenger, world.city, {
      matchMode: "first_take",
    });
    order = created.body.data.order;
    await request(app)
      .post(`/api/orders/${order._id}/accept`)
      .set("Cookie", world.drivers[0].cookie)
      .send({});
  });

  afterEach(() => {
    while (clients.length) clients.pop().close();
  });

  it("participants (passenger and assigned driver) may join the order room", async () => {
    const passenger = await connectClient(world.passenger.cookie);
    const driver = await connectClient(world.drivers[0].cookie);
    clients.push(passenger, driver);
    expect((await joinRoom(passenger, order._id)).ok).toBe(true);
    expect((await joinRoom(driver, order._id)).ok).toBe(true);
  });

  it("outsider driver is refused", async () => {
    const outsider = await connectClient(world.drivers[1].cookie);
    clients.push(outsider);
    const res = await joinRoom(outsider, order._id);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("forbidden");
  });

  it("order:status reaches a participant who joined the room", async () => {
    const passenger = await connectClient(world.passenger.cookie);
    const driver = await connectClient(world.drivers[0].cookie);
    clients.push(passenger, driver);
    await joinRoom(passenger, order._id);
    const statusPromise = waitFor(passenger, "order:status");
    await request(app)
      .post(`/api/orders/${order._id}/action`)
      .set("Cookie", world.drivers[0].cookie)
      .send({ action: "arrive" });
    const payload = await statusPromise;
    expect(payload.orderId).toBe(String(order._id));
  });
});
