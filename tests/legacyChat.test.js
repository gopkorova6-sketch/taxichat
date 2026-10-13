const http = require("http");
const request = require("supertest");
const { io: ioClient } = require("socket.io-client");
const app = require("../app");
const initSocket = require("../socket");
const { connectTestDb, disconnectTestDb } = require("./db");
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

const waitFor = (client, event, timeoutMs = 4000) =>
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

// Connects with the session cookie; the server verifies the JWT on handshake
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

const legacyMessage = (senderId) => ({
  sender: senderId,
  messageType: "text",
  message: `msg-${Math.random().toString(36).slice(2)}`,
  timeSent: new Date().toISOString(),
  readStatus: false,
  deliveredStatus: false,
});

describe("Legacy chat over verified sockets", () => {
  let passenger;
  let driver;
  let chatRoomId;

  beforeEach(async () => {
    passenger = await registerUser(app);
    driver = await registerUser(app);

    const res = await request(app)
      .post("/api/contacts")
      .set("Cookie", passenger.cookie)
      .send({ name: "Водитель", username: driver.user.username });
    expect(res.status).toBe(201);
    chatRoomId = res.body.data.contact.chatRoomId;
  });

  it("message sender is enforced server-side, not taken from the client", async () => {
    const passengerClient = await connectClient(passenger.cookie);
    const driverClient = await connectClient(driver.cookie);

    const receivedPromise = waitFor(driverClient, "user:message");

    // The client tries to spoof the sender
    passengerClient.emit("user:message", {
      chatRoomId,
      message: legacyMessage(driver.user._id),
    });

    const payload = await receivedPromise;
    expect(String(payload.message.sender)).toBe(
      String(passenger.user._id)
    );

    passengerClient.close();
    driverClient.close();
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  it("flooding is limited to 30 messages per minute", async () => {
    const passengerClient = await connectClient(passenger.cookie);
    await connectClient(driver.cookie);

    const errorPromise = waitFor(passengerClient, "chat:error");

    for (let i = 0; i < 35; i += 1) {
      passengerClient.emit("user:message", {
        chatRoomId,
        message: legacyMessage(passenger.user._id),
      });
    }

    const error = await errorPromise;
    expect(error.error).toContain("Слишком много сообщений");

    passengerClient.close();
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
});
