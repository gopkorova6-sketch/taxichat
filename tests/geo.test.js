const request = require("supertest");
const app = require("../app");
const { importGeoData } = require("../scripts/geoImport");
const geoSeed = require("../data/geoSeed");
const City = require("../models/City");
const Zone = require("../models/Zone");
const { connectTestDb, disconnectTestDb, clearTestDb } = require("./db");
const { registerAndLogin } = require("./helpers");

beforeAll(async () => {
  await connectTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  await importGeoData(geoSeed);
});

describe("Geo import", () => {
  it("is idempotent: importing twice does not duplicate documents", async () => {
    const first = await importGeoData(geoSeed);
    const second = await importGeoData(geoSeed);
    expect(second).toEqual(first);

    const cities = await City.countDocuments();
    const zones = await Zone.countDocuments();
    expect(cities).toBe(5);
    expect(zones).toBe(18);
  });

  it("links zone neighbors within the same city", async () => {
    const kazan = await City.findOne({ name: "Казань" });
    const center = await Zone.findOne({ cityId: kazan._id, name: "Центр" }).populate(
      "neighbors",
      "name"
    );
    const neighborNames = center.neighbors.map((zone) => zone.name).sort();
    expect(neighborNames).toEqual(["Вахитовский", "Ново-Савиновский"]);
  });
});

describe("Geo API", () => {
  let authCookie;

  beforeEach(async () => {
    authCookie = await registerAndLogin(app);
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/geo/regions");
    expect(res.status).toBe(401);
  });

  it("lists regions", async () => {
    const res = await request(app)
      .get("/api/geo/regions")
      .set("Cookie", authCookie);
    expect(res.status).toBe(200);
    const names = res.body.data.regions.map((region) => region.name);
    expect(names).toContain("Республика Татарстан");
    expect(names).toContain("Самарская область");
  });

  it("searches cities by name and shows the region for disambiguation", async () => {
    const res = await request(app)
      .get("/api/geo/cities?query=каз")
      .set("Cookie", authCookie);
    expect(res.status).toBe(200);
    const kazan = res.body.data.cities.find((city) => city.name === "Казань");
    expect(kazan).toBeDefined();
    expect(kazan.region.name).toBe("Республика Татарстан");
    expect(kazan.status).toBe("DORMANT");
    expect(kazan.tz).toBe("Europe/Moscow");
  });

  it("lists zones of a city", async () => {
    const kazan = await City.findOne({ name: "Казань" });
    const res = await request(app)
      .get(`/api/geo/cities/${kazan._id}/zones`)
      .set("Cookie", authCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.zones).toHaveLength(4);
  });

  it("finds landmarks by alias text search", async () => {
    const kazan = await City.findOne({ name: "Казань" });
    const res = await request(app)
      .get(`/api/geo/cities/${kazan._id}/landmarks?query=ЖД`)
      .set("Cookie", authCookie);
    expect(res.status).toBe(200);
    const names = res.body.data.landmarks.map((landmark) => landmark.name);
    expect(names.some((name) => name.includes("вокзал"))).toBe(true);
  });

  it("returns 404 for an unknown city", async () => {
    const res = await request(app)
      .get("/api/geo/cities/000000000000000000000000/zones")
      .set("Cookie", authCookie);
    expect(res.status).toBe(404);
  });
});
