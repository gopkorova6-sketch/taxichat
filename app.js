const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");

const app = express();
const authRouter = require("./routers/authRouter");
const contactsRouter = require("./routers/contactsRouter");
const chatRoomRouter = require("./routers/chatRoomRouter");
const profileRouter = require("./routers/profileRouter");
const uploadRouter = require("./routers/uploadRouter");
const geoRouter = require("./routers/geoRouter");
const membershipRouter = require("./routers/membershipRouter");
const dispatchRouter = require("./routers/dispatchRouter");
const applicationRouter = require("./routers/applicationRouter");
const adminRouter = require("./routers/adminRouter");
const driverRouter = require("./routers/driverRouter");
const userRouter = require("./routers/userRouter");
const orderRouter = require("./routers/orderRouter");
const callRouter = require("./routers/callRouter");
const socialRouter = require("./routers/socialRouter");
const citiesRouter = require("./routers/citiesRouter");
const chatRouter = require("./routers/chatRouter");
const { protect } = require("./utilities/auth");
const errorController = require("./controllers/errorController");

const allowedOrigins = (process.env.CLIENT_URL ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
  })
);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Routes
app.use("/api/user", authRouter);

// Protector: verifies JWT cookie on every remaining API route
app.use("/api/*", protect);

app.use("/api/contacts", contactsRouter);
app.use("/api/profile", profileRouter);
app.use("/api/chatRoom", chatRoomRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/geo", geoRouter);
app.use("/api/memberships", membershipRouter);
app.use("/api/dispatch", dispatchRouter);
app.use("/api/applications", applicationRouter);
app.use("/api/admin", adminRouter);
app.use("/api/drivers", driverRouter);
app.use("/api/users", userRouter);
app.use("/api/orders", orderRouter);
app.use("/api/calls", callRouter);
app.use("/api/cities", citiesRouter);
app.use("/api/chats", chatRouter);
app.use("/api", socialRouter);

// Error handle middleware
app.use(errorController);

module.exports = app;
