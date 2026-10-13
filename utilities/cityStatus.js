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

module.exports = { computeCityStatus, CITY_STATUSES };
