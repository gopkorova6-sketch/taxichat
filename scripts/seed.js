const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const User = require("../models/User");

const PASSWORD = "password123";

// Demo accounts; roles and city memberships are added by later seed stages
const users = [
  { username: "superadmin", name: "Суперадмин Платформы" },
  { username: "regionadmin", name: "Админ Региона" },
  { username: "dispatcher", name: "Диспетчер" },
  { username: "driver", name: "Водитель Иван" },
  { username: "passenger", name: "Пассажир Анна" },
];

const seed = async () => {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set. Copy .env.example to .env first.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to database "${mongoose.connection.name}"`);

  for (const { username, name } of users) {
    await User.deleteOne({ username });
    await User.create({
      username,
      name,
      password: PASSWORD,
      confirmPassword: PASSWORD,
    });
    console.log(`  + ${username} — ${name}`);
  }

  console.log(`\nAll accounts use password: ${PASSWORD}`);

  await mongoose.disconnect();
};

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
