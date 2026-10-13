const request = require("supertest");

// Registers a unique user and returns the auth cookie for API tests
const registerAndLogin = async (app) => {
  const userData = {
    name: "Тестовый Пользователь",
    username: `user_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
    password: "password123",
    confirmPassword: "password123",
  };

  const res = await request(app).post("/api/user/register").send(userData);
  return res.headers["set-cookie"];
};

module.exports = { registerAndLogin };
