const CITY_STATUSES = ["DORMANT", "WAITLIST", "PILOT", "ACTIVE", "SUSPENDED"];

// Pure computation of a city status from membership counts (concept 1.4).
// SUSPENDED is sticky: it is set and lifted only manually by an admin.
const computeCityStatus = (city, counts = {}) => {
  const { members = 0, drivers = 0, dispatchers = 0 } = counts;

  if (city.status === "SUSPENDED") return "SUSPENDED";
  if (members === 0) return "DORMANT";

  const thresholds = city.thresholds ?? {};
  const pilotDrivers = thresholds.pilotDrivers ?? 3;
  const activeDrivers = thresholds.activeDrivers ?? 10;
  const activeDispatchers = thresholds.activeDispatchers ?? 2;

  if (dispatchers === 0 || drivers === 0) return "WAITLIST";
  if (drivers >= activeDrivers && dispatchers >= activeDispatchers) return "ACTIVE";
  if (drivers >= pilotDrivers) return "PILOT";
  return "WAITLIST";
};

// Recounts memberships of the city and persists the recalculated status.
// Runs on every membership change (concept 1.4: transitions are automatic).
const recalcCityStatus = async (cityId) => {
  const Membership = require("../models/Membership");
  const City = require("../models/City");

  const [members, drivers, dispatchers] = await Promise.all([
    Membership.countDocuments({ cityId }),
    Membership.countDocuments({ cityId, role: "driver", status: "ACTIVE" }),
    Membership.countDocuments({ cityId, role: "dispatcher", status: "ACTIVE" }),
  ]);

  const city = await City.findById(cityId);
  if (!city) return null;

  const from = city.status;
  const to = computeCityStatus(city, { members, drivers, dispatchers });

  if (to !== from) {
    city.status = to;
    await city.save();
  }

  return { from, to, counts: { members, drivers, dispatchers }, changed: to !== from };
};

module.exports = { computeCityStatus, recalcCityStatus, CITY_STATUSES };
