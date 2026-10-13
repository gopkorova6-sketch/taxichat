const request = require("supertest");
const { registerUser } = require("./helpers");

// Builds a PILOT city with an approved dispatcher, approved drivers and an
// ACTIVE passenger; everything goes through the real API
const setupPilotCity = async (app, { cityName = "Казань", driversCount = 3 } = {}) => {
  const { importGeoData } = require("../scripts/geoImport");
  const geoSeed = require("../data/geoSeed");
  const { clearTestDb } = require("./db");
  const City = require("../models/City");
  const Zone = require("../models/Zone");
  const User = require("../models/User");

  await clearTestDb();
  await importGeoData(geoSeed);

  const city = await City.findOne({ name: cityName });
  const zones = await Zone.find({ cityId: city._id }).sort({ name: 1 });

  const superadmin = await registerUser(app, {
    username: `root_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
  });
  await User.findByIdAndUpdate(superadmin.user._id, { isSuperadmin: true });

  const dispatcher = await registerUser(app);
  const grant = await request(app)
    .post("/api/admin/roles")
    .set("Cookie", superadmin.cookie)
    .send({ userId: dispatcher.user._id, cityId: city._id, role: "dispatcher" });
  if (grant.status !== 201) throw new Error("dispatcher grant failed");

  const drivers = [];
  for (let i = 0; i < driversCount; i += 1) {
    const driver = await registerUser(app);
    const applied = await request(app)
      .post("/api/memberships")
      .set("Cookie", driver.cookie)
      .send({
        cityId: city._id,
        role: "driver",
        displayName: `Водитель ${i + 1}`,
        phone: `+7900000001${i}`,
        car: { color: ["Белый", "Чёрный", "Серый", "Синий"][i % 4], plate: `10${i}` + String(Date.now()).slice(-4) },
        zones: [zones[i % zones.length]._id.toString()],
      });
    if (applied.status !== 201) throw new Error(`driver apply failed: ${JSON.stringify(applied.body)}`);

    const approved = await request(app)
      .patch(`/api/dispatch/drivers/${applied.body.data.membership._id}`)
      .set("Cookie", superadmin.cookie)
      .send({ decision: "approve" });
    if (approved.status !== 200) throw new Error(`driver approve failed: ${JSON.stringify(approved.body)}`);

    drivers.push(driver);
  }

  const passenger = await registerUser(app);
  const joined = await request(app)
    .post("/api/memberships")
    .set("Cookie", passenger.cookie)
    .send({ cityId: city._id, role: "passenger" });
  if (joined.status !== 201) throw new Error("passenger join failed");

  return { city, zones, superadmin, dispatcher, drivers, passenger };
};

// Creates an order via the passenger and returns the response
const createOrder = async (app, passenger, city, zones, overrides = {}) =>
  request(app)
    .post("/api/orders")
    .set("Cookie", passenger.cookie)
    .send({
      cityId: city._id,
      fromZoneId: zones[0]._id,
      toZoneId: zones[1 % zones.length]._id,
      fromText: "От ЖД вокзала",
      toText: "Главная площадь",
      exactFrom: "ул. Привокзальная, 1",
      exactTo: "пл. Свободы, 2",
      pax: 2,
      ...overrides,
    });

module.exports = { setupPilotCity, createOrder };
