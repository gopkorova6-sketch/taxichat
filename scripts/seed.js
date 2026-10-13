const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const User = require("../models/User");
const City = require("../models/City");
const Zone = require("../models/Zone");
const Membership = require("../models/Membership");
const DriverProfile = require("../models/DriverProfile");
const { importGeoData } = require("./geoImport");
const geoSeed = require("../data/geoSeed");
const { recalcCityStatus } = require("../utilities/cityStatus");

const PASSWORD = "password123";

const upsertUser = async (data) => {
  await User.deleteOne({ username: data.username });
  return User.create({ ...data, password: PASSWORD, confirmPassword: PASSWORD });
};

const upsertMembership = async (data) => {
  await Membership.deleteOne({
    userId: data.userId,
    cityId: data.cityId,
    role: data.role,
  });
  return Membership.create(data);
};

const seed = async () => {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set. Copy .env.example to .env first.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to database "${mongoose.connection.name}"`);

  console.log("Importing geo reference data...");
  const summary = await importGeoData(geoSeed);
  console.log(
    `  regions: ${summary.regions}, cities: ${summary.cities}, zones: ${summary.zones}, landmarks: ${summary.landmarks}`
  );

  console.log("Creating demo accounts:");
  const superadmin = await upsertUser({
    username: "superadmin",
    name: "Суперадмин Платформы",
    isSuperadmin: true,
  });
  const regionadmin = await upsertUser({
    username: "regionadmin",
    name: "Админ Самарской области",
  });
  const dispatcher = await upsertUser({
    username: "dispatcher",
    name: "Диспетчер Казани",
  });
  const dispatcher2 = await upsertUser({
    username: "dispatcher2",
    name: "Диспетчер Самары",
  });
  const driver1 = await upsertUser({ username: "driver1", name: "Иван Водитель" });
  const driver2 = await upsertUser({ username: "driver2", name: "Пётр Шофёр" });
  const driver3 = await upsertUser({ username: "driver3", name: "Олег Таксист" });
  const passenger = await upsertUser({ username: "passenger", name: "Анна Пассажир" });

  const kazan = await City.findOne({ name: "Казань" });
  const samara = await City.findOne({ name: "Самара" });
  const kazanZones = await Zone.find({ cityId: kazan._id }).sort({ name: 1 });
  const samaraZones = await Zone.find({ cityId: samara._id }).sort({ name: 1 });

  console.log("Creating memberships:");
  await upsertMembership({
    userId: regionadmin._id,
    cityId: samara._id,
    role: "region_admin",
    status: "ACTIVE",
  });
  await upsertMembership({
    userId: dispatcher._id,
    cityId: kazan._id,
    role: "dispatcher",
    status: "ACTIVE",
  });
  await upsertMembership({
    userId: dispatcher2._id,
    cityId: samara._id,
    role: "dispatcher",
    status: "ACTIVE",
  });

  const driverSpecs = [
    {
      user: driver1,
      membership: { cityId: kazan._id, zones: kazanZones.slice(0, 2).map((zone) => zone._id) },
      profile: {
        displayName: "Иван",
        phone: "+79001234567",
        car: { color: "Белый", plate: "456", brand: "Lada" },
      },
    },
    {
      user: driver2,
      membership: { cityId: kazan._id, zones: [kazanZones[0]._id] },
      profile: {
        displayName: "Пётр",
        phone: "+79001234568",
        car: { color: "Чёрный", plate: "789" },
      },
    },
    {
      user: driver3,
      membership: { cityId: kazan._id, zones: kazanZones.slice(2, 4).map((zone) => zone._id) },
      profile: {
        displayName: "Олег",
        phone: "+79001234569",
        car: { color: "Серебристый", plate: "321", brand: "Kia" },
      },
    },
  ];

  for (const spec of driverSpecs) {
    const membership = await upsertMembership({
      userId: spec.user._id,
      role: "driver",
      status: "ACTIVE",
      ...spec.membership,
    });
    await DriverProfile.deleteOne({ membershipId: membership._id });
    await DriverProfile.create({ membershipId: membership._id, ...spec.profile });
  }

  await upsertMembership({
    userId: passenger._id,
    cityId: kazan._id,
    role: "passenger",
    status: "ACTIVE",
  });

  for (const city of [kazan, samara]) {
    const change = await recalcCityStatus(city._id);
    console.log(`  ${city.name}: ${change.from} -> ${change.to}`);
  }

  console.log(`\nAll accounts use password: ${PASSWORD}`);
  console.log("Demo: passenger, driver1-3 and dispatcher work in Kazan (PILOT);");

  await mongoose.disconnect();
};

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
