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

  if (dispatchers >= activeDispatchers && drivers >= activeDrivers) return "ACTIVE";

  // Города, добавленные пользователями вручную, не опускаются ниже PILOT —
  // иначе первый пользователь не смог бы заказывать (упрощение для тестов)
  if (city.custom) return "PILOT";

  if (dispatchers === 0 || drivers === 0) return "WAITLIST";
  if (drivers >= pilotDrivers) return "PILOT";
  return "WAITLIST";
};

// Recounts memberships of the city and persists the recalculated status.
// When the city grows to PILOT or ACTIVE, passengers from the waitlist are
// activated automatically (concept 1.4). Idempotent.
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

  let activatedPassengers = [];
  if (to !== from && ["PILOT", "ACTIVE"].includes(to)) {
    const waitlist = await Membership.find({
      cityId,
      role: "passenger",
      status: "WAITLIST",
    }).select("userId");
    if (waitlist.length > 0) {
      await Membership.updateMany(
        { cityId, role: "passenger", status: "WAITLIST" },
        { $set: { status: "ACTIVE" } }
      );
      activatedPassengers = waitlist.map((item) => item.userId);
    }
  }

  if (to !== from) {
    city.status = to;
    await city.save();
  }

  if (activatedPassengers.length > 0) {
    const { emitOrderEvents } = require("./sockets");
    emitOrderEvents(
      activatedPassengers.map((userId) => ({
        room: `user:${userId}`,
        event: "membership:updated",
        payload: { cityId: String(cityId), role: "passenger", status: "ACTIVE" },
      }))
    );
  }

  return {
    from,
    to,
    counts: { members, drivers, dispatchers },
    changed: to !== from,
    activatedPassengers,
  };
};

module.exports = { computeCityStatus, recalcCityStatus, CITY_STATUSES };
