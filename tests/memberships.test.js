const request = require("supertest");
const app = require("../app");
const { importGeoData } = require("../scripts/geoImport");
const geoSeed = require("../data/geoSeed");
const City = require("../models/City");
const Zone = require("../models/Zone");
const Membership = require("../models/Membership");
const DriverProfile = require("../models/DriverProfile");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const { connectTestDb, disconnectTestDb, clearTestDb } = require("./db");
const { registerUser } = require("./helpers");

let kazan, samara, kazanZones, samaraZones, dormant;

beforeAll(async () => {
  await connectTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

// Creates the reference data plus a superadmin; returns its cookie
const setupWorld = async () => {
  await clearTestDb();
  await importGeoData(geoSeed);
  kazan = await City.findOne({ name: "Слюдянка" });
  samara = await City.findOne({ name: "Култук" });
  kazanZones = await Zone.find({ cityId: kazan._id }).sort({ name: 1 });
  samaraZones = await Zone.find({ cityId: samara._id }).sort({ name: 1 });
  // Отдельный "спящий" город для проверок порогов: все города сида
  // всегда активны, поэтому статус DORMANT/PILOT проверяем на этом городе
  dormant = await City.create({
    name: "Тест-Дормант",
    oktmo: "99999001",
    regionId: kazan.regionId,
    tz: "Asia/Irkutsk",
    status: "DORMANT",
    zones: undefined,
  });

  const superadmin = await registerUser(app, { username: "root" });
  await User.findByIdAndUpdate(superadmin.user._id, { isSuperadmin: true });
  return superadmin;
};

const becomeDispatcher = async (superadminCookie, userId, cityId) => {
  const res = await request(app)
    .post("/api/admin/roles")
    .set("Cookie", superadminCookie)
    .send({ userId, cityId, role: "dispatcher" });
  expect(res.status).toBe(201);
  return res.body.data.membership;
};

const applyAsDriver = async (
  cookie,
  { cityId, zones, color = "Белый", plate = "456", phone = "+79001234567" }
) =>
  request(app)
    .post("/api/memberships")
    .set("Cookie", cookie)
    .send({
      cityId,
      role: "driver",
      displayName: "Тест Водитель",
      phone,
      car: { color, plate },
      zones,
    });

const passengerJoin = async (cookie, cityId) =>
  request(app)
    .post("/api/memberships")
    .set("Cookie", cookie)
    .send({ cityId, role: "passenger" });

describe("Memberships and RBAC", () => {
  let superadmin;

  beforeEach(async () => {
    superadmin = await setupWorld();
  });

  it("passenger gets WAITLIST in a dormant city and the city moves to WAITLIST", async () => {
    const user = await registerUser(app);
    const res = await passengerJoin(user.cookie, dormant._id);

    expect(res.status).toBe(201);
    expect(res.body.data.membership.status).toBe("WAITLIST");
    expect(res.body.message).toContain("ещё не запущен");

    const city = await City.findById(dormant._id);
    expect(city.status).toBe("WAITLIST");
  });

  it("driver application is PENDING with a normalized phone", async () => {
    const driver = await registerUser(app);
    const res = await applyAsDriver(driver.cookie, {
      cityId: kazan._id,
      zones: [kazanZones[0]._id],
      phone: "8 (900) 123-45-67",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.membership.status).toBe("PENDING");

    const profile = await DriverProfile.findOne({
      membershipId: res.body.data.membership._id,
    });
    expect(profile.phone).toBe("+79001234567");
  });

  it("rejects a duplicate phone", async () => {
    const first = await registerUser(app);
    const second = await registerUser(app);

    await applyAsDriver(first.cookie, {
      cityId: kazan._id,
      zones: [kazanZones[0]._id],
      phone: "+79001112233",
    });
    const res = await applyAsDriver(second.cookie, {
      cityId: kazan._id,
      zones: [kazanZones[0]._id],
      phone: "89001112233",
    });

    expect(res.status).toBe(409);
  });

  it("dispatcher approves drivers; the city becomes PILOT at 3 drivers", async () => {
    const dispatcherUser = await registerUser(app);
    await becomeDispatcher(superadmin.cookie, dispatcherUser.user._id, dormant._id);

    for (let i = 0; i < 3; i += 1) {
      const driver = await registerUser(app);
      const applied = await applyAsDriver(driver.cookie, {
        cityId: dormant._id,
        zones: [],
        plate: `${100 + i}`,
        phone: `+7900000000${i}`,
      });

      const approved = await request(app)
        .patch(`/api/dispatch/drivers/${applied.body.data.membership._id}`)
        .set("Cookie", dispatcherUser.cookie)
        .send({ decision: "approve" });
      expect(approved.status).toBe(200);
      expect(approved.body.data.membership.status).toBe("ACTIVE");
    }

    const city = await City.findById(dormant._id);
    expect(city.status).toBe("PILOT");
  });

  it("reject requires a reason and stores it", async () => {
    const dispatcherUser = await registerUser(app);
    await becomeDispatcher(superadmin.cookie, dispatcherUser.user._id, kazan._id);
    const driver = await registerUser(app);
    const applied = await applyAsDriver(driver.cookie, {
      cityId: kazan._id,
      zones: [kazanZones[0]._id],
    });
    const membershipId = applied.body.data.membership._id;

    const noReason = await request(app)
      .patch(`/api/dispatch/drivers/${membershipId}`)
      .set("Cookie", dispatcherUser.cookie)
      .send({ decision: "reject" });
    expect(noReason.status).toBe(400);

    const rejected = await request(app)
      .patch(`/api/dispatch/drivers/${membershipId}`)
      .set("Cookie", dispatcherUser.cookie)
      .send({ decision: "reject", reason: "Некорректные данные" });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.membership.status).toBe("REJECTED");
    expect(rejected.body.data.membership.reason).toBe("Некорректные данные");
  });

  it("does not allow two active drivers of one city to share color+plate", async () => {
    const dispatcherUser = await registerUser(app);
    await becomeDispatcher(superadmin.cookie, dispatcherUser.user._id, kazan._id);

    const first = await registerUser(app);
    const firstApplied = await applyAsDriver(first.cookie, {
      cityId: kazan._id,
      zones: [kazanZones[0]._id],
      color: "Белый",
      plate: "456",
      phone: "+79000000001",
    });
    await request(app)
      .patch(`/api/dispatch/drivers/${firstApplied.body.data.membership._id}`)
      .set("Cookie", dispatcherUser.cookie)
      .send({ decision: "approve" });

    const second = await registerUser(app);
    const secondApplied = await applyAsDriver(second.cookie, {
      cityId: kazan._id,
      zones: [kazanZones[1]._id],
      color: "белый",
      plate: "456",
      phone: "+79000000002",
    });
    const res = await request(app)
      .patch(`/api/dispatch/drivers/${secondApplied.body.data.membership._id}`)
      .set("Cookie", dispatcherUser.cookie)
      .send({ decision: "approve" });

    expect(res.status).toBe(409);
    const membership = await Membership.findById(secondApplied.body.data.membership._id);
    expect(membership.status).toBe("PENDING");
  });

  it("a dispatcher of one city has no rights in another city", async () => {
    const kazanDispatcher = await registerUser(app);
    await becomeDispatcher(superadmin.cookie, kazanDispatcher.user._id, kazan._id);

    const samaraDriver = await registerUser(app);
    const applied = await applyAsDriver(samaraDriver.cookie, {
      cityId: samara._id,
      zones: [samaraZones[0]._id],
      phone: "+79000000009",
    });

    const listed = await request(app)
      .get(`/api/dispatch/${samara._id}/drivers?status=PENDING`)
      .set("Cookie", kazanDispatcher.cookie);
    expect(listed.status).toBe(403);

    const reviewed = await request(app)
      .patch(`/api/dispatch/drivers/${applied.body.data.membership._id}`)
      .set("Cookie", kazanDispatcher.cookie)
      .send({ decision: "approve" });
    expect(reviewed.status).toBe(403);
  });

  it("a dispatcher cannot review his own driver application in the same city", async () => {
    const dispatcherUser = await registerUser(app);
    await becomeDispatcher(superadmin.cookie, dispatcherUser.user._id, kazan._id);

    const applied = await applyAsDriver(dispatcherUser.cookie, {
      cityId: kazan._id,
      zones: [kazanZones[0]._id],
      phone: "+79000000008",
    });

    const res = await request(app)
      .patch(`/api/dispatch/drivers/${applied.body.data.membership._id}`)
      .set("Cookie", dispatcherUser.cookie)
      .send({ decision: "approve" });

    expect(res.status).toBe(403);
  });

  it("autoApproveDrivers activates the driver immediately", async () => {
    await City.findByIdAndUpdate(kazan._id, {
      "settings.autoApproveDrivers": true,
    });

    const driver = await registerUser(app);
    const res = await applyAsDriver(driver.cookie, {
      cityId: kazan._id,
      zones: [kazanZones[0]._id],
      phone: "+79000000007",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.membership.status).toBe("ACTIVE");
  });

  it("a passenger of a PILOT city gets an ACTIVE membership", async () => {
    const dispatcherUser = await registerUser(app);
    await becomeDispatcher(superadmin.cookie, dispatcherUser.user._id, kazan._id);
    for (let i = 0; i < 3; i += 1) {
      const driver = await registerUser(app);
      const applied = await applyAsDriver(driver.cookie, {
        cityId: kazan._id,
        zones: [kazanZones[i]._id],
        plate: `${200 + i}`,
        phone: `+7900000030${i}`,
      });
      await request(app)
        .patch(`/api/dispatch/drivers/${applied.body.data.membership._id}`)
        .set("Cookie", dispatcherUser.cookie)
        .send({ decision: "approve" });
    }

    const passengerUser = await registerUser(app);
    const res = await passengerJoin(passengerUser.cookie, kazan._id);

    expect(res.status).toBe(201);
    expect(res.body.data.membership.status).toBe("ACTIVE");
  });

  it("waitlist passengers activate automatically when the city reaches PILOT", async () => {
    // Passenger joins while the city is DORMANT -> WAITLIST
    const earlyPassenger = await registerUser(app);
    const joined = await passengerJoin(earlyPassenger.cookie, dormant._id);
    expect(joined.body.data.membership.status).toBe("WAITLIST");

    const dispatcherUser = await registerUser(app);
    await becomeDispatcher(superadmin.cookie, dispatcherUser.user._id, dormant._id);
    for (let i = 0; i < 3; i += 1) {
      const driver = await registerUser(app);
      const applied = await applyAsDriver(driver.cookie, {
        cityId: dormant._id,
        zones: [],
        plate: `${300 + i}`,
        phone: `+7900000040${i}`,
      });
      await request(app)
        .patch(`/api/dispatch/drivers/${applied.body.data.membership._id}`)
        .set("Cookie", dispatcherUser.cookie)
        .send({ decision: "approve" });
    }

    // The city is PILOT now; the waitlist passenger must be ACTIVE
    const mine = await request(app)
      .get("/api/memberships/mine")
      .set("Cookie", earlyPassenger.cookie);
    const membership = mine.body.data.memberships.find(
      (item) => item.role === "passenger"
    );
    expect(membership.status).toBe("ACTIVE");
  });

  it("/me returns memberships", async () => {
    const user = await registerUser(app);
    await passengerJoin(user.cookie, kazan._id);

    const res = await request(app).get("/api/user/me").set("Cookie", user.cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.memberships).toHaveLength(1);
    expect(res.body.data.memberships[0].role).toBe("passenger");
    expect(res.body.data.memberships[0].cityId.name).toBe("Слюдянка");
  });
});

describe("Applications and role chain", () => {
  let superadmin;

  beforeEach(async () => {
    superadmin = await setupWorld();
  });

  it("region admin approves a dispatcher application and the audit log records it", async () => {
    // Region admin for the Tatarstan region (via Samara? no - via Kazan region admin)
    const regionAdmin = await registerUser(app);
    const grantRegion = await request(app)
      .post("/api/admin/roles")
      .set("Cookie", superadmin.cookie)
      .send({ userId: regionAdmin.user._id, cityId: kazan._id, role: "region_admin" });
    expect(grantRegion.status).toBe(201);

    const applicant = await registerUser(app);
    const applied = await request(app)
      .post("/api/applications")
      .set("Cookie", applicant.cookie)
      .send({ cityId: kazan._id, type: "dispatcher", note: "Опыт работы" });
    expect(applied.status).toBe(201);

    const listed = await request(app)
      .get("/api/admin/applications?type=dispatcher")
      .set("Cookie", regionAdmin.cookie);
    expect(listed.status).toBe(200);
    expect(listed.body.data.applications).toHaveLength(1);

    const reviewed = await request(app)
      .patch(`/api/admin/applications/${applied.body.data.application._id}`)
      .set("Cookie", regionAdmin.cookie)
      .send({ decision: "approve" });
    expect(reviewed.status).toBe(200);

    const membership = await Membership.findOne({
      userId: applicant.user._id,
      role: "dispatcher",
    });
    expect(membership?.status).toBe("ACTIVE");

    const auditEntry = await AuditLog.findOne({
      action: "admin.applicationReviewed",
      "payload.cityId": kazan._id,
    });
    expect(auditEntry).toBeTruthy();
  });

  it("only a superadmin can assign the region_admin role", async () => {
    const regionAdmin = await registerUser(app);
    await request(app)
      .post("/api/admin/roles")
      .set("Cookie", superadmin.cookie)
      .send({ userId: regionAdmin.user._id, cityId: kazan._id, role: "region_admin" });

    const candidate = await registerUser(app);

    const forbidden = await request(app)
      .post("/api/admin/roles")
      .set("Cookie", regionAdmin.cookie)
      .send({ userId: candidate.user._id, cityId: samara._id, role: "region_admin" });
    expect(forbidden.status).toBe(403);

    const allowed = await request(app)
      .post("/api/admin/roles")
      .set("Cookie", superadmin.cookie)
      .send({ userId: candidate.user._id, cityId: samara._id, role: "region_admin" });
    expect(allowed.status).toBe(201);
  });

  it("the home city can change only once per 30 days", async () => {
    const user = await registerUser(app);

    const first = await request(app)
      .patch("/api/users/me/home-city")
      .set("Cookie", user.cookie)
      .send({ cityId: kazan._id });
    expect(first.status).toBe(200);

    const second = await request(app)
      .patch("/api/users/me/home-city")
      .set("Cookie", user.cookie)
      .send({ cityId: samara._id });
    expect(second.status).toBe(403);
  });

  it("driver can toggle acceptDirectCalls", async () => {
    const driver = await registerUser(app);
    const applied = await applyAsDriver(driver.cookie, {
      cityId: kazan._id,
      zones: [kazanZones[0]._id],
      phone: "+79000000006",
    });
    const approved = await request(app)
      .patch(`/api/dispatch/drivers/${applied.body.data.membership._id}`)
      .set("Cookie", superadmin.cookie)
      .send({ decision: "approve" });
    expect(approved.status).toBe(200);

    const mine = await request(app)
      .get("/api/memberships/mine")
      .set("Cookie", driver.cookie);
    const membershipId = mine.body.data.memberships[0]._id;

    const res = await request(app)
      .patch("/api/drivers/me/settings")
      .set("Cookie", driver.cookie)
      .send({ cityId: kazan._id, acceptDirectCalls: false });

    expect(res.status).toBe(200);
    expect(res.body.data.profile.acceptDirectCalls).toBe(false);
    expect(res.body.data.profile.membershipId).toBe(membershipId);
  });
});
