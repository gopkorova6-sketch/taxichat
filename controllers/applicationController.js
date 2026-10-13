const { z } = require("zod");
const mongoose = require("mongoose");
const Application = require("../models/Application");
const City = require("../models/City");
const ApiError = require("../utilities/errors");
const catchAsyncError = require("../utilities/catchAsyncError");
const { validateBody } = require("../utilities/catchAsyncError");
const { logAudit } = require("../utilities/audit");

const createApplicationSchema = z.object({
  cityId: z.string().min(1, "Не указан город"),
  type: z.enum(["dispatcher", "region_admin"], {
    errorMap: () => ({ message: "Тип заявки: dispatcher или region_admin" }),
  }),
  note: z.string().trim().max(1000, "Слишком длинное описание").optional(),
});

exports.createApplicationSchema = createApplicationSchema;

// POST /api/applications — apply for dispatcher or region admin
exports.createApplication = [
  validateBody(createApplicationSchema),
  catchAsyncError(async (req, res) => {
    const { cityId, type, note } = req.body;

    const city = await City.findById(cityId);
    if (!city) throw new ApiError(404, "Город не найден");

    const existing = await Application.findOne({
      userId: req.user._id,
      cityId,
      type,
      status: "PENDING",
    });
    if (existing) throw new ApiError(409, "Такая заявка уже подана и ждёт рассмотрения");

    const application = await Application.create({
      userId: req.user._id,
      cityId,
      type,
      status: "PENDING",
      ...(note && { note }),
    });

    await logAudit({
      actorId: req.user._id,
      action: "application.created",
      targetType: "Application",
      targetId: application._id,
      payload: { cityId, type },
    });

    res.status(201).json({ status: "success", data: { application } });
  }),
];

// GET /api/applications/mine
exports.getMyApplications = catchAsyncError(async (req, res) => {
  const applications = await Application.find({ userId: req.user._id })
    .populate("cityId", "name status")
    .sort({ createdAt: -1 });

  res.json({ status: "success", data: { applications } });
});
