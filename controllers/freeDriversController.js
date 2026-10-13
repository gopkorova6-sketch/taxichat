const mongoose = require("mongoose");
const City = require("../models/City");
const Membership = require("../models/Membership");
const DriverProfile = require("../models/DriverProfile");
const Favorite = require("../models/Favorite");
const Block = require("../models/Block");
const ApiError = require("../utilities/errors");
const catchAsyncError = require("../utilities/catchAsyncError");
const { carCaption } = require("../utilities/drivers");

const HEARTBEAT_WINDOW_MS = 90 * 1000; // concept 1.8
const PAGE_SIZE = 20;

// GET /api/cities/:id/free-drivers?zoneId=&cursor=
// Drivers online right now, accepting direct calls, not busy in a call and
// not blocked by the requester. No phone numbers are exposed (concept 1.6).
exports.listFreeDrivers = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id))
    throw new ApiError(400, "Некорректный идентификатор города");

  const city = await City.findById(id).select("settings.directCallsEnabled name");
  if (!city) throw new ApiError(404, "Город не найден");
  if (city.settings?.directCallsEnabled === false)
    throw new ApiError(403, "Прямые вызовы водителей отключены в этом городе");

  const memberships = await Membership.find({
    cityId: id,
    role: "driver",
    status: "ACTIVE",
  }).select("_id userId zones");

  const membershipIds = memberships.map((membership) => membership._id);
  const profiles = await DriverProfile.find({
    membershipId: { $in: membershipIds },
    shift: "online",
    acceptDirectCalls: true,
    inCall: false,
    lastSeen: { $gte: new Date(Date.now() - HEARTBEAT_WINDOW_MS) },
  });

  const profileByMembership = new Map(
    profiles.map((profile) => [String(profile.membershipId), profile])
  );

  const favoriteIds = new Set(
    (
      await Favorite.find({ passengerId: req.user._id }).select("driverId")
    ).map((favorite) => String(favorite.driverId))
  );

  const blocks = await Block.find({
    $or: [{ userId: req.user._id }, { blockedUserId: req.user._id }],
  });
  const blockedIds = new Set(
    blocks.map((block) =>
      String(block.userId) === String(req.user._id)
        ? String(block.blockedUserId)
        : String(block.userId)
    )
  );

  const requestedZoneId = req.query.zoneId ? String(req.query.zoneId) : null;

  let entries = memberships
    .map((membership) => {
      const profile = profileByMembership.get(String(membership._id));
      if (!profile) return null;
      const driverId = String(membership.userId);
      if (driverId === String(req.user._id)) return null;
      if (blockedIds.has(driverId)) return null;

      return {
        driverId: membership.userId,
        displayName: profile.displayName,
        carCaption: profile.car ? carCaption(profile.car) : undefined,
        rating: profile.rating,
        zones: membership.zones,
        isFavorite: favoriteIds.has(driverId),
        matchesZone: requestedZoneId
          ? membership.zones.some((zone) => String(zone) === requestedZoneId)
          : false,
        lastSeen: profile.lastSeen,
      };
    })
    .filter(Boolean);

  // Sort: favorites first, then zone match, then rating, then heartbeat
  entries.sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
    if (a.matchesZone !== b.matchesZone) return a.matchesZone ? -1 : 1;
    const ratingA = a.rating ?? 0;
    const ratingB = b.rating ?? 0;
    if (ratingA !== ratingB) return ratingB - ratingA;
    return new Date(b.lastSeen ?? 0) - new Date(a.lastSeen ?? 0);
  });

  const offset = req.query.cursor
    ? Math.max(0, parseInt(Buffer.from(req.query.cursor, "base64").toString("utf8"), 10) || 0)
    : 0;
  const page = entries.slice(offset, offset + PAGE_SIZE);
  const nextCursor =
    offset + PAGE_SIZE < entries.length
      ? Buffer.from(String(offset + PAGE_SIZE), "utf8").toString("base64")
      : null;

  res.json({
    status: "success",
    data: {
      drivers: page.map((entry) => ({
        driverId: entry.driverId,
        displayName: entry.displayName,
        carCaption: entry.carCaption,
        rating: entry.rating,
        isFavorite: entry.isFavorite,
        matchesZone: entry.matchesZone,
        zones: entry.zones,
      })),
      nextCursor,
    },
  });
});
