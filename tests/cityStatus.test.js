const { computeCityStatus } = require("../utilities/cityStatus");

const city = (overrides = {}) => ({
  status: "DORMANT",
  thresholds: { pilotDrivers: 3, activeDrivers: 10, activeDispatchers: 2 },
  ...overrides,
});

describe("computeCityStatus", () => {
  it("stays DORMANT when nobody registered", () => {
    expect(computeCityStatus(city(), { members: 0 })).toBe("DORMANT");
  });

  it("becomes WAITLIST as soon as there are registrations but no drivers", () => {
    expect(computeCityStatus(city(), { members: 5, drivers: 0, dispatchers: 1 })).toBe("WAITLIST");
  });

  it("becomes WAITLIST when there are drivers but no dispatcher", () => {
    expect(computeCityStatus(city(), { members: 5, drivers: 5, dispatchers: 0 })).toBe("WAITLIST");
  });

  it("becomes PILOT with a dispatcher and at least pilotDrivers confirmed drivers", () => {
    expect(computeCityStatus(city(), { members: 20, drivers: 3, dispatchers: 1 })).toBe("PILOT");
  });

  it("becomes ACTIVE when thresholds are met", () => {
    expect(computeCityStatus(city(), { members: 50, drivers: 10, dispatchers: 2 })).toBe("ACTIVE");
  });

  it("stays WAITLIST below the pilot threshold", () => {
    expect(computeCityStatus(city(), { members: 20, drivers: 2, dispatchers: 2 })).toBe("WAITLIST");
  });

  it("respects custom city thresholds", () => {
    const custom = city({ thresholds: { pilotDrivers: 1, activeDrivers: 4, activeDispatchers: 1 } });
    expect(computeCityStatus(custom, { members: 10, drivers: 1, dispatchers: 1 })).toBe("PILOT");
    expect(computeCityStatus(custom, { members: 10, drivers: 4, dispatchers: 1 })).toBe("ACTIVE");
  });

  it("keeps SUSPENDED sticky regardless of counts", () => {
    const suspended = city({ status: "SUSPENDED" });
    expect(computeCityStatus(suspended, { members: 50, drivers: 20, dispatchers: 5 })).toBe("SUSPENDED");
  });
});
