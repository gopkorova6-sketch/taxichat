const Membership = require("../models/Membership");
const ApiError = require("./errors");
const catchAsyncError = require("./catchAsyncError");

const membershipCityId = (membership) =>
  String(membership.cityId?._id ?? membership.cityId);

// Loads all memberships of the current user once per request
const loadMemberships = catchAsyncError(async (req, res, next) => {
  req.memberships = await Membership.find({ userId: req.user._id }).populate(
    "cityId",
    "name status tz"
  );
  next();
});

const isSuperadmin = (req) => req.user?.isSuperadmin === true;

// Finds an active membership of the given role for the city taken from
// req[cityFrom][key]. Any permission check must go through this helper so a
// role in one city never grants rights in another (concept 1.3).
const requireMembership = ({ role, status = "ACTIVE", cityFrom = "params", key = "cityId" } = {}) =>
  (req, res, next) => {
    const cityId = req[cityFrom]?.[key];
    if (!cityId) return next(new ApiError(400, "Не указан город"));

    if (isSuperadmin(req)) {
      req.membership = null;
      return next();
    }

    const membership = (req.memberships ?? []).find(
      (item) =>
        membershipCityId(item) === String(cityId) &&
        item.role === role &&
        item.status === status
    );

    if (!membership)
      return next(new ApiError(403, "Недостаточно прав в этом городе"));

    req.membership = membership;
    next();
  };

// Region admin of any region OR superadmin; used for cross-city review paths
const requireRegionAdmin = () => (req, res, next) => {
  if (isSuperadmin(req)) return next();
  const regionAdmin = (req.memberships ?? []).some(
    (item) => item.role === "region_admin" && item.status === "ACTIVE"
  );
  if (!regionAdmin)
    return next(new ApiError(403, "Требуются права администратора региона"));
  next();
};

// True when the user may review driver applications in the city:
// an ACTIVE dispatcher of that city, a region admin of its region, or superadmin
const canReviewInCity = async (req, cityId) => {
  if (isSuperadmin(req)) return true;

  const City = require("../models/City");

  const memberships = req.memberships ?? [];
  const cityKey = String(cityId);

  const dispatcher = memberships.some(
    (item) =>
      membershipCityId(item) === cityKey &&
      item.role === "dispatcher" &&
      item.status === "ACTIVE"
  );
  if (dispatcher) return true;

  const city = await City.findById(cityId);
  if (!city) return false;

  for (const item of memberships) {
    if (item.role !== "region_admin" || item.status !== "ACTIVE") continue;
    const adminCity = await City.findById(membershipCityId(item));
    if (adminCity && String(adminCity.regionId) === String(city.regionId))
      return true;
  }

  return false;
};

// Города региона, где пользователь — активный админ региона.
// Возвращает массив id городов; суперадмин получает null (значит «все»).
const regionAdminCityIds = async (req) => {
  if (isSuperadmin(req)) return null;
  const City = require("../models/City");
  const adminCityIds = (req.memberships ?? [])
    .filter((item) => item.role === "region_admin" && item.status === "ACTIVE")
    .map((item) => membershipCityId(item));
  if (adminCityIds.length === 0) return [];
  const adminCities = await City.find({ _id: { $in: adminCityIds } }).select("regionId");
  const regionIds = [...new Set(adminCities.map((c) => String(c.regionId)).filter(Boolean))];
  if (regionIds.length === 0) return [];
  const regionCities = await City.find({ regionId: { $in: regionIds } }).select("_id");
  return regionCities.map((c) => String(c._id));
};

module.exports = {
  loadMemberships,
  requireMembership,
  requireRegionAdmin,
  canReviewInCity,
  isSuperadmin,
  membershipCityId,
  regionAdminCityIds,
};
