const { z } = require("zod");
const mongoose = require("mongoose");
const DriverProfile = require("../models/DriverProfile");
const ApiError = require("../utilities/errors");
const catchAsyncError = require("../utilities/catchAsyncError");
const { validateBody } = require("../utilities/catchAsyncError");
const { requireMembership, loadMemberships } = require("../utilities/rbac");
const { carCaption } = require("../utilities/drivers");

const settingsSchema = z.object({
  cityId: z.string().min(1, "Не указан город"),
  acceptDirectCalls: z.boolean({
    errorMap: () => ({ message: "acceptDirectCalls должен быть true или false" }),
  }),
});

exports.settingsSchema = settingsSchema;

// GET /api/drivers/me?cityId=
exports.getMyDriverProfile = [
  loadMemberships,
  catchAsyncError(async (req, res) => {
    const { cityId } = req.query;
    const memberships = (req.memberships ?? []).filter(
      (item) =>
        item.role === "driver" &&
        item.status === "ACTIVE" &&
        (!cityId || String(item.cityId?._id ?? item.cityId) === String(cityId))
    );

    const profiles = await DriverProfile.find({
      membershipId: { $in: memberships.map((item) => item._id) },
    });

    res.json({
      status: "success",
      data: {
        profiles: profiles.map((profile) => ({
          ...profile.toObject(),
          carCaption: carCaption(profile),
        })),
      },
    });
  }),
];

// PATCH /api/drivers/me/settings — { acceptDirectCalls } for a city membership
exports.updateMySettings = [
  loadMemberships,
  validateBody(settingsSchema),
  requireMembership({ role: "driver", cityFrom: "body" }),
  catchAsyncError(async (req, res) => {
    const { acceptDirectCalls } = req.body;

    const profile = await DriverProfile.findOne({ membershipId: req.membership._id });
    if (!profile) throw new ApiError(404, "Анкета водителя не найдена");

    profile.acceptDirectCalls = acceptDirectCalls;
    await profile.save();

    res.json({
      status: "success",
      data: { profile: { ...profile.toObject(), carCaption: carCaption(profile) } },
    });
  }),
];
