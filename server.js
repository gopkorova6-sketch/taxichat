const express = require("express");
const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

const app = require("./app");

dotenv.config({ path: "./.env" });

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is not set. Copy .env.example to .env and configure it.");
  process.exit(1);
}

if (!process.env.JWT_SECRET_KEY) {
  console.error("JWT_SECRET_KEY is not set. Copy .env.example to .env and configure it.");
  process.exit(1);
}

// Connect database
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Database connected..."))
  .catch((error) => {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  });

// Serve client folder
app.use(express.static(path.join(__dirname, "client", "build")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "client", "build", "index.html"));
});

//   Listen to port
exports.expressServer = app.listen(process.env.PORT || 4000, () =>
  console.log("Listening...")
);
