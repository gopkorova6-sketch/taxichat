const { z } = require("zod");
const User = require("../models/User");
const ApiError = require("../utilities/errors");
const catchAsyncError = require("../utilities/catchAsyncError");
const { sendAuthCookie, clearAuthCookie } = require("../utilities/auth");

const registerSchema = z
  .object({
    name: z.string().trim().min(1, "Укажите имя").max(50, "Имя слишком длинное"),
    username: z
      .string()
      .trim()
      .min(3, "Логин должен содержать минимум 3 символа")
      .max(30, "Логин слишком длинный")
      .regex(/^[a-zA-Z0-9_.-]+$/, "Логин: только латиница, цифры и символы . _ -")
      .transform((value) => value.toLowerCase()),
    password: z.string().min(8, "Пароль должен содержать минимум 8 символов"),
    confirmPassword: z.string().min(1, "Повторите пароль"),
    bio: z.string().max(100).optional(),
    avatar: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Пароли не совпадают",
    path: ["confirmPassword"],
  });

const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Введите логин")
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1, "Введите пароль"),
});

exports.registerSchema = registerSchema;
exports.loginSchema = loginSchema;

exports.register = catchAsyncError(async (req, res) => {
  const { name, username, password, bio, avatar } = req.body;

  const existing = await User.findOne({ username });
  if (existing) throw new ApiError(409, "Логин уже занят");

  const newUser = await User.create({
    name,
    username,
    password,
    confirmPassword: req.body.confirmPassword,
    ...(bio !== undefined && { bio }),
    ...(avatar !== undefined && { avatar }),
  });

  sendAuthCookie(newUser, res, 201);
});

exports.login = catchAsyncError(async (req, res, next) => {
  const { username, password } = req.body;

  const foundUser = await User.findOne({ username });

  if (!foundUser)
    return next(new ApiError(400, "Неверный логин или пароль"));

  const passwordGivenCorrect = await foundUser.checkPasswordValidity(
    password,
    foundUser.password
  );

  if (!passwordGivenCorrect)
    return next(new ApiError(400, "Неверный логин или пароль"));

  sendAuthCookie(foundUser, res, 200);
});

exports.logout = (req, res) => {
  clearAuthCookie(res);
  res.status(200).json({ status: "success", message: "Вы вышли из аккаунта" });
};

exports.me = catchAsyncError(async (req, res) => {
  const Membership = require("../models/Membership");
  const DriverProfile = require("../models/DriverProfile");

  const memberships = await Membership.find({ userId: req.user._id })
    .populate("cityId", "name status tz")
    .populate("zones", "name");

  const driverProfiles = await DriverProfile.find({
    membershipId: { $in: memberships.map((membership) => membership._id) },
  });

  res.status(200).json({
    status: "success",
    data: { user: req.user, memberships, driverProfiles },
  });
});
