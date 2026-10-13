const mongoose = require("mongoose");
const Block = require("../models/Block");
const Favorite = require("../models/Favorite");
const User = require("../models/User");
const DriverProfile = require("../models/DriverProfile");
const Membership = require("../models/Membership");
const ApiError = require("../utilities/errors");
const catchAsyncError = require("../utilities/catchAsyncError");
const { carCaption } = require("../utilities/drivers");

// POST /api/blocks — block a user
exports.blockUser = catchAsyncError(async (req, res) => {
  const { userId: targetId } = req.body;
  if (!mongoose.isValidObjectId(targetId))
    throw new ApiError(400, "Некорректный пользователь");
  if (String(targetId) === String(req.user._id))
    throw new ApiError(400, "Нельзя заблокировать себя");

  const target = await User.findById(targetId);
  if (!target) throw new ApiError(404, "Пользователь не найден");

  await Block.updateOne(
    { userId: req.user._id, blockedUserId: targetId },
    { $setOnInsert: { userId: req.user._id, blockedUserId: targetId } },
    { upsert: true }
  );

  res.status(201).json({ status: "success", data: { blockedUserId: targetId } });
});

// DELETE /api/blocks/:userId
exports.unblockUser = catchAsyncError(async (req, res) => {
  await Block.deleteOne({ userId: req.user._id, blockedUserId: req.params.userId });
  res.json({ status: "success" });
});

// GET /api/blocks
exports.listBlocks = catchAsyncError(async (req, res) => {
  const blocks = await Block.find({ userId: req.user._id }).populate(
    "blockedUserId",
    "username name"
  );
  res.json({ status: "success", data: { blocks } });
});

// POST /api/favorites — add a driver to the personal list
exports.addFavorite = catchAsyncError(async (req, res) => {
  const { driverId } = req.body;
  if (!mongoose.isValidObjectId(driverId))
    throw new ApiError(400, "Некорректный водитель");
  if (String(driverId) === String(req.user._id))
    throw new ApiError(400, "Нельзя добавить себя в избранные");

  const driverMembership = await Membership.findOne({
    userId: driverId,
    role: "driver",
  });
  if (!driverMembership) throw new ApiError(404, "Водитель не найден");

  await Favorite.updateOne(
    { passengerId: req.user._id, driverId },
    { $setOnInsert: { passengerId: req.user._id, driverId } },
    { upsert: true }
  );

  res.status(201).json({ status: "success", data: { driverId } });
});

// DELETE /api/favorites/:driverId
exports.removeFavorite = catchAsyncError(async (req, res) => {
  await Favorite.deleteOne({
    passengerId: req.user._id,
    driverId: req.params.driverId,
  });
  res.json({ status: "success" });
});

// GET /api/favorites — favorite drivers with their profiles (no phone shown)
exports.listFavorites = catchAsyncError(async (req, res) => {
  const favorites = await Favorite.find({ passengerId: req.user._id }).sort({
    priority: -1,
    createdAt: -1,
  });

  const driverIds = favorites.map((favorite) => favorite.driverId);
  const memberships = await Membership.find({
    userId: { $in: driverIds },
    role: "driver",
  }).populate("cityId", "name status");

  const profiles = await DriverProfile.find({
    membershipId: { $in: memberships.map((membership) => membership._id) },
  });
  const profileByMembership = new Map(
    profiles.map((profile) => [String(profile.membershipId), profile])
  );

  const result = memberships
    .map((membership) => {
      const profile = profileByMembership.get(String(membership._id));
      if (!profile) return null;
      return {
        driverId: membership.userId,
        city: membership.cityId
          ? { _id: membership.cityId._id, name: membership.cityId.name }
          : null,
        displayName: profile.displayName,
        carCaption: profile.car ? carCaption(profile.car) : undefined,
        shift: profile.shift,
        acceptDirectCalls: profile.acceptDirectCalls,
        rating: profile.rating,
      };
    })
    .filter(Boolean);

  res.json({ status: "success", data: { favorites: result } });
});
